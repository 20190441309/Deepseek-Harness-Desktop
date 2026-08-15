import { useEffect, useRef, useState } from 'react'
import { relativeTime } from '../api/fold.ts'
import { drawerGroups, filterDrawer } from '../api/select.ts'
import type { HomeData, SessionRow } from '../api/client.ts'
import type { Copy, Lang } from '../locale.ts'

type Props = {
  t: Copy
  lang: Lang
  open: boolean
  home: HomeData
  currentId: string
  searchHits: Set<string>
  searchError: string
  searching: boolean
  searchHasMore: boolean
  onClose: () => void
  onOpen: (session: SessionRow) => void
  onNewChat: (workspaceId?: string) => void
  onSearch: (query: string) => void | Promise<void>
  onMenu: (session: SessionRow) => void
  onSettings: () => void
}

export function Drawer({
  t, lang, open, home, currentId, searchHits, searchError, searching, searchHasMore,
  onClose, onOpen, onNewChat, onSearch, onMenu, onSettings,
}: Props) {
  const [query, setQuery] = useState('')
  const timer = useRef(0)

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { onSearch(query) }, 300)
    return () => { window.clearTimeout(timer.current) }
  }, [query, onSearch])

  const groups = drawerGroups(home)
  const { grouped, leftover } = filterDrawer(groups.grouped, groups.leftover, query, searchHits)
  const hasRows = grouped.some((group) => group.sessions.length > 0) || leftover.length > 0
  const showEmpty = query.trim() ? !hasRows : home.workspaces.length === 0 && leftover.length === 0

  return (
    <>
      <button type="button" className={`drawer-mask${open ? ' open' : ''}`} aria-label={t.menu} onClick={onClose} />
      <aside className={`drawer${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="drawer-head">
          <button type="button" className="new-chat" onClick={() => { onNewChat() }}>{t.newChat}</button>
          <input
            className="search"
            value={query}
            placeholder={t.search}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          {searching ? <p className="drawer-hint">{t.searching}</p> : null}
          {searchError ? <p className="drawer-hint">{searchError}</p> : null}
          {searchHasMore ? <p className="drawer-hint">{t.searchHasMore}</p> : null}
        </div>
        <div className="scroll pad drawer-list">
          {showEmpty ? <p className="empty">{t.noSessions}</p> : null}
          {grouped.map(({ workspace, sessions }) => (
            <section key={workspace.workspaceId}>
              <div className="workspace-row">
                <h2 className="workspace">{workspace.title}</h2>
                <button
                  type="button"
                  className="icon-btn add"
                  aria-label={t.addInWorkspace}
                  onClick={() => { onNewChat(workspace.workspaceId) }}
                >
                  +
                </button>
              </div>
              {sessions.map((session) => (
                <SessionButton
                  key={session.sessionId}
                  t={t}
                  lang={lang}
                  session={session}
                  current={session.sessionId === currentId}
                  onOpen={onOpen}
                  onMenu={onMenu}
                />
              ))}
            </section>
          ))}
          {leftover.length > 0 ? (
            <section>
              <h2 className="workspace">{t.other}</h2>
              {leftover.map((session) => (
                <SessionButton
                  key={session.sessionId}
                  t={t}
                  lang={lang}
                  session={session}
                  current={session.sessionId === currentId}
                  onOpen={onOpen}
                  onMenu={onMenu}
                />
              ))}
            </section>
          ) : null}
        </div>
        <div className="drawer-foot">
          <button type="button" className="settings-btn" onClick={onSettings}>{t.settings}</button>
        </div>
      </aside>
    </>
  )
}

function SessionButton({
  t, lang, session, current, onOpen, onMenu,
}: {
  t: Copy
  lang: Lang
  session: SessionRow
  current: boolean
  onOpen: (session: SessionRow) => void
  onMenu: (session: SessionRow) => void
}) {
  const timer = useRef(0)
  const held = useRef(false)

  const clear = (): void => {
    window.clearTimeout(timer.current)
  }

  const startHold = (): void => {
    held.current = false
    clear()
    timer.current = window.setTimeout(() => {
      held.current = true
      onMenu(session)
    }, 480)
  }

  return (
    <button
      type="button"
      className={`row${current ? ' current' : ''}`}
      onClick={() => {
        if (held.current) {
          held.current = false
          return
        }
        onOpen(session)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(session)
      }}
      onTouchStart={startHold}
      onTouchEnd={clear}
      onTouchMove={clear}
      onTouchCancel={clear}
      onMouseDown={(event) => {
        if (event.button === 0) {
          startHold()
        }
      }}
      onMouseUp={clear}
      onMouseLeave={clear}
    >
      <span className="row-title">{session.title}</span>
      <span className="row-meta">
        {relativeTime(session.updatedAt, Date.now(), lang)}
        {session.running ? ` · ${t.running}` : ''}
      </span>
    </button>
  )
}
