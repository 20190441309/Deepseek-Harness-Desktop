import { useCallback, useEffect, useRef, useState } from 'react'
import { foldEvents } from './api/fold.ts'
import {
  archiveSession,
  createSession,
  describeHost,
  forkSession,
  listenDownlinks,
  loadHistory,
  loadHome,
  renameSession,
  searchSessions,
  sendPrompt,
  type HomeData,
  type SessionRow,
} from './api/client.ts'
import { loginWithOffer, offerFromHash } from './api/offer.ts'
import {
  connectionMode,
  findReusableBlank,
  pickInitialSession,
  resolveStartWorkspace,
} from './api/select.ts'
import { copy, type Lang } from './locale.ts'
import {
  applyTheme,
  loadCurrentSession,
  loadLang,
  loadTheme,
  saveCurrentSession,
  saveLang,
  saveTheme,
  type Theme,
} from './prefs.ts'
import { BootSplash } from './ui/BootSplash.tsx'
import { ChatPage } from './ui/ChatPage.tsx'
import { Drawer } from './ui/Drawer.tsx'
import { SessionMenu } from './ui/SessionMenu.tsx'
import { SettingsPage } from './ui/SettingsPage.tsx'

type Screen =
  | { name: 'boot'; message: string }
  | { name: 'pair'; message: string }
  | {
    name: 'shell'
    home: HomeData
    session: SessionRow | null
    events: unknown[]
    sending: boolean
    loading: boolean
    error: string
  }

function useVisualViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport
    const apply = (): void => {
      const height = viewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--vv-height', `${height}px`)
    }
    apply()
    viewport?.addEventListener('resize', apply)
    window.addEventListener('resize', apply)
    return () => {
      viewport?.removeEventListener('resize', apply)
      window.removeEventListener('resize', apply)
    }
  }, [])
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => loadLang())
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [screen, setScreen] = useState<Screen>({ name: 'boot', message: copy[loadLang()].connecting })
  const [drawer, setDrawer] = useState(false)
  const [settings, setSettings] = useState(false)
  const [menu, setMenu] = useState<SessionRow | null>(null)
  const [searchHits, setSearchHits] = useState<Set<string>>(new Set())
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchHasMore, setSearchHasMore] = useState(false)
  const t = copy[lang]
  const langRef = useRef(lang)
  langRef.current = lang
  useVisualViewportHeight()

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => { applyTheme(theme) }
    media.addEventListener('change', onChange)
    return () => { media.removeEventListener('change', onChange) }
  }, [theme])

  useEffect(() => {
    saveLang(lang)
  }, [lang])

  const boot = useCallback(async (cancelled?: () => boolean): Promise<void> => {
    const text = copy[langRef.current]
    const gone = (): boolean => Boolean(cancelled?.())
    setDrawer(false)
    setSettings(false)
    setMenu(null)
    setScreen({ name: 'boot', message: text.connecting })
    const offer = offerFromHash(location.hash)
    if (offer) {
      setScreen({ name: 'boot', message: text.signingIn })
      const ok = await loginWithOffer(offer.token)
      if (gone()) {
        return
      }
      if (ok) {
        history.replaceState(null, '', '/')
      }
    }
    try {
      setScreen({ name: 'boot', message: text.loadingSessions })
      await describeHost()
      const home = await loadHome()
      if (gone()) {
        return
      }
      const session = pickInitialSession(home, loadCurrentSession())
      if (!session) {
        setDrawer(true)
        setScreen({ name: 'shell', home, session: null, events: [], sending: false, loading: false, error: '' })
        return
      }
      saveCurrentSession(session.sessionId)
      setScreen({ name: 'shell', home, session, events: [], sending: false, loading: true, error: '' })
      try {
        const events = await loadHistory(session.sessionId)
        if (gone()) {
          return
        }
        setScreen({ name: 'shell', home, session, events, sending: false, loading: false, error: '' })
      } catch (error) {
        if (gone()) {
          return
        }
        setScreen({
          name: 'shell',
          home,
          session,
          events: [],
          sending: false,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } catch (error) {
      if (gone()) {
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      setScreen({
        name: 'pair',
        message: message === 'unauthorized' ? text.pairBody : message,
      })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void boot(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [boot])

  useEffect(() => {
    if (screen.name !== 'shell') {
      return
    }
    return listenDownlinks((frame) => {
      setScreen((current) => {
        if (current.name !== 'shell') {
          return current
        }
        if (current.session && frame.type === 'session/event' && frame.sessionId === current.session.sessionId) {
          const event = frame.event && typeof frame.event === 'object' ? frame.event as { type?: string } : null
          if (!event) {
            return current
          }
          const sending = event.type === 'assistant/message' || event.type === 'turn/end' ? false : current.sending
          return { ...current, events: [...current.events, event], sending }
        }
        if (frame.type === 'host/session-added' || frame.type === 'host/session-status' || frame.type === 'host/workspace-changed') {
          void loadHome().then((home) => {
            setScreen((now) => {
              if (now.name !== 'shell') {
                return now
              }
              const next = now.session
                ? home.sessions.find((row) => row.sessionId === now.session?.sessionId) ?? now.session
                : now.session
              return { ...now, home, session: next }
            })
          }).catch(() => {})
        }
        return current
      })
    })
  }, [screen.name])

  const openSession = async (home: HomeData, session: SessionRow): Promise<void> => {
    saveCurrentSession(session.sessionId)
    setDrawer(false)
    setMenu(null)
    setScreen({ name: 'shell', home, session, events: [], sending: false, loading: true, error: '' })
    try {
      const events = await loadHistory(session.sessionId)
      setScreen({ name: 'shell', home, session, events, sending: false, loading: false, error: '' })
    } catch (error) {
      setScreen({
        name: 'shell',
        home,
        session,
        events: [],
        sending: false,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const startSession = async (workspaceId?: string): Promise<void> => {
    if (screen.name !== 'shell') {
      return
    }
    const home = screen.home
    const workspace = resolveStartWorkspace(home, screen.session?.sessionId, workspaceId)
    try {
      if (workspace) {
        const reuse = findReusableBlank(home, workspace)
        if (reuse) {
          await openSession(home, reuse)
          return
        }
        const created = await createSession(workspace.workspaceId)
        const nextHome = await loadHome()
        const row = nextHome.sessions.find((item) => item.sessionId === created.sessionId) ?? {
          sessionId: created.sessionId,
          title: workspace.title,
          updatedAt: Date.now(),
          running: false,
          blank: true,
          cwd: workspace.path,
        }
        await openSession(nextHome, row)
        return
      }
      const created = await createSession()
      const nextHome = await loadHome()
      const row = nextHome.sessions.find((item) => item.sessionId === created.sessionId) ?? {
        sessionId: created.sessionId,
        title: t.emptyTitle,
        updatedAt: Date.now(),
        running: false,
        blank: true,
      }
      await openSession(nextHome, row)
    } catch (error) {
      setScreen((current) => current.name === 'shell'
        ? { ...current, error: error instanceof Error ? error.message : String(error) }
        : current)
    }
  }

  const send = async (text: string): Promise<void> => {
    if (screen.name !== 'shell' || !screen.session) {
      return
    }
    const optimistic = {
      type: 'user/message',
      seq: Date.now(),
      data: { content: [{ type: 'text', text }] },
    }
    setScreen({ ...screen, events: [...screen.events, optimistic], sending: true, error: '' })
    try {
      await sendPrompt(screen.session.sessionId, text)
    } catch (error) {
      setScreen((current) => current.name === 'shell'
        ? { ...current, sending: false, error: error instanceof Error ? error.message : String(error) }
        : current)
    }
  }

  const onSearch = useCallback(async (query: string): Promise<void> => {
    const needle = query.trim()
    if (!needle) {
      setSearchHits(new Set())
      setSearchError('')
      setSearching(false)
      setSearchHasMore(false)
      return
    }
    setSearching(true)
    setSearchError('')
    try {
      const result = await searchSessions(needle)
      setSearchHits(new Set(result.items.map((item) => item.sessionId)))
      setSearchHasMore(Boolean(result.hasMore))
    } catch {
      setSearchHits(new Set())
      setSearchHasMore(false)
      setSearchError(copy[lang].searchUnavailable)
    } finally {
      setSearching(false)
    }
  }, [lang])

  if (screen.name === 'boot') {
    return <BootSplash t={t} status={screen.message} spinning />
  }

  if (screen.name === 'pair') {
    return (
      <BootSplash
        t={t}
        status={t.pairTitle}
        spinning={false}
        error={screen.message}
        onRetry={() => { void boot() }}
      />
    )
  }

  return (
    <>
      <ChatPage
        t={t}
        title={screen.session?.title || t.emptyTitle}
        messages={foldEvents(screen.events)}
        sending={screen.sending}
        loading={screen.loading}
        error={screen.error}
        empty={!screen.session}
        drawerOpen={drawer}
        onToggleDrawer={() => { setDrawer((open) => !open) }}
        onSend={(text) => { void send(text) }}
      />
      <Drawer
        t={t}
        lang={lang}
        open={drawer}
        home={screen.home}
        currentId={screen.session?.sessionId || ''}
        searchHits={searchHits}
        searchError={searchError}
        searching={searching}
        searchHasMore={searchHasMore}
        onClose={() => { setDrawer(false) }}
        onOpen={(session) => { void openSession(screen.home, session) }}
        onNewChat={(workspaceId) => { void startSession(workspaceId) }}
        onSearch={onSearch}
        onMenu={(session) => { setMenu(session) }}
        onSettings={() => {
          setDrawer(false)
          setSettings(true)
        }}
      />
      <SessionMenu
        t={t}
        session={menu}
        onClose={() => { setMenu(null) }}
        onRename={async (session, title) => {
          try {
            await renameSession(session.sessionId, title)
            const home = await loadHome()
            setMenu(null)
            setScreen((current) => {
              if (current.name !== 'shell') {
                return current
              }
              const next = current.session?.sessionId === session.sessionId
                ? home.sessions.find((row) => row.sessionId === session.sessionId) ?? { ...current.session, title }
                : current.session
              return { ...current, home, session: next }
            })
          } catch (error) {
            setScreen((current) => current.name === 'shell'
              ? { ...current, error: error instanceof Error ? error.message : String(error) }
              : current)
          }
        }}
        onFork={async (session) => {
          setMenu(null)
          try {
            const child = await forkSession(session.sessionId)
            const home = await loadHome()
            const row = home.sessions.find((item) => item.sessionId === child.sessionId)
            if (row) {
              await openSession(home, row)
            }
          } catch (error) {
            setScreen((current) => current.name === 'shell'
              ? { ...current, error: error instanceof Error ? error.message : String(error) }
              : current)
          }
        }}
        onArchive={async (session) => {
          setMenu(null)
          try {
            await archiveSession(session.sessionId)
            const home = await loadHome()
            if (screen.session?.sessionId === session.sessionId) {
              const next = pickInitialSession(home, '')
              if (next) {
                await openSession(home, next)
              } else {
                saveCurrentSession(null)
                setDrawer(true)
                setScreen({ name: 'shell', home, session: null, events: [], sending: false, loading: false, error: '' })
              }
              return
            }
            setScreen((current) => current.name === 'shell' ? { ...current, home } : current)
          } catch (error) {
            setScreen((current) => current.name === 'shell'
              ? { ...current, error: error instanceof Error ? error.message : String(error) }
              : current)
          }
        }}
      />
      {settings ? (
        <SettingsPage
          t={t}
          lang={lang}
          theme={theme}
          origin={location.origin}
          mode={connectionMode(location.hostname)}
          onClose={() => { setSettings(false) }}
          onTheme={setTheme}
          onLang={setLang}
        />
      ) : null}
    </>
  )
}
