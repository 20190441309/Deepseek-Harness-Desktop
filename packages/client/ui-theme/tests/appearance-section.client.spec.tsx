// @vitest-environment jsdom
/** Appearance section: color-scheme tiles, two-ball library, editor, glass, type. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deepseek-ai/dsh-client-ui-primitives')>()
  return { ...actual, writeClipboard: vi.fn(async () => true) }
})
import { AppearanceSection } from '../src/client/AppearanceSection.tsx'
import type { AppearanceSectionComponentProps } from '../src/client/AppearanceSection.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { AppearanceSyncSnapshot } from '../src/client/settings-store.ts'
import { listThemeFamilies } from '../src/builtin-families.ts'
import { serializeThemeFamily, type ThemeFamily } from '../src/theme-family.ts'
import { DEFAULT_THEME_SETTINGS, type ThemePreference } from '../src/theme-settings.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const COPY = zh

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

const CUSTOM: ThemeFamily = {
  id: 'grove',
  name: 'Grove',
  origin: 'custom',
  light: { accent: '#0f766e', background: '#f3faf7', foreground: '#10211c', contrast: 44 },
  dark: { accent: '#3dd6b5', background: '#071411', foreground: '#e7f6f1', contrast: 50 },
}

function snap(overrides: Partial<AppearanceSyncSnapshot> = {}): AppearanceSyncSnapshot {
  const customThemes = overrides.customThemes ?? []
  return {
    preference: DEFAULT_THEME_SETTINGS.preference,
    activeLightThemeId: 'deepseek',
    activeDarkThemeId: 'deepseek',
    families: listThemeFamilies(customThemes),
    customThemes,
    glassOpacity: DEFAULT_THEME_SETTINGS.glassOpacity,
    fontFamilySans: '',
    fontFamilyCode: '',
    fontSizeInterface: DEFAULT_THEME_SETTINGS.fontSizeInterface,
    fontSizeCode: DEFAULT_THEME_SETTINGS.fontSizeCode,
    fontFamilyComposer: '',
    fontFamilyTerminal: '',
    ...overrides,
    families: overrides.families ?? listThemeFamilies(overrides.customThemes ?? customThemes),
  }
}

function mount(preference: ThemePreference = 'system', overrides: Partial<AppearanceSyncSnapshot> = {}) {
  const store = createAppearanceRowStore().create()
  store.actions.sync(snap({ preference, ...overrides }), 0)
  const setTheme = vi.fn()
  const setThemeHalf = vi.fn()
  const setCustomThemes = vi.fn()
  const setGlassOpacity = vi.fn()
  const setTypography = vi.fn()
  const props: AppearanceSectionComponentProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key as keyof typeof COPY] ?? key,
    close: vi.fn(),
    setTheme,
    setThemeHalf,
    setCustomThemes,
    setGlassOpacity,
    setTypography,
  }
  const view = render(<AppearanceSection {...props} />)
  return { store, setTheme, setThemeHalf, setCustomThemes, setGlassOpacity, setTypography, ...view }
}

const cube = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}$`) })
const pressed = (name: string): string | null => cube(name).getAttribute('aria-pressed')

describe('AppearanceSection', () => {
  it('renders color-scheme tiles with the preference cube selected', () => {
    mount('dark')
    expect(screen.getByText('色制')).toBeDefined()
    expect(pressed('深色')).toBe('true')
    expect(pressed('浅色')).toBe('false')
    expect(pressed('跟随系统')).toBe('false')
  })

  it('click drives setTheme; selection follows the store mirror', () => {
    const b = mount('dark')
    fireEvent.click(cube('浅色'))
    expect(b.setTheme).toHaveBeenCalledWith('light')
    expect(pressed('深色')).toBe('true')
    act(() => { b.store.actions.sync(snap({ preference: 'light' }), 1) })
    expect(pressed('浅色')).toBe('true')
  })

  it('selects light and dark halves from the two-ball grid', () => {
    const b = mount('system')
    fireEvent.click(screen.getByRole('button', { name: '青瓷 浅色半' }))
    expect(b.setThemeHalf).toHaveBeenCalledWith('light', 'celadon')
    fireEvent.click(screen.getByRole('button', { name: '青瓷 深色半' }))
    expect(b.setThemeHalf).toHaveBeenCalledWith('dark', 'celadon')
  })

  it('creates from the light half when the dark id is unknown', () => {
    const b = mount('system', { activeDarkThemeId: 'missing', activeLightThemeId: 'celadon' })
    fireEvent.click(screen.getByRole('button', { name: '创建主题' }))
    expect(screen.getByDisplayValue(/青瓷/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(b.setCustomThemes).not.toHaveBeenCalled()
  })

  it('creates from the first family when neither half id is present', () => {
    mount('system', { activeDarkThemeId: 'missing', activeLightThemeId: 'also-missing' })
    fireEvent.click(screen.getByRole('button', { name: '创建主题' }))
    expect(screen.getByDisplayValue(/DeepSeek/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
  })

  it('keeps typography advanced closed when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    mount('system')
    expect(screen.queryByText('输入框字体')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '高级' }))
    vi.unstubAllGlobals()
  })

  it('treats throwing localStorage reads as collapsed advanced typography', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    mount('system')
    expect(screen.queryByText('输入框字体')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('creates, edits, and saves a custom family from the current half', () => {
    const b = mount('system')
    fireEvent.click(screen.getByRole('button', { name: '创建主题' }))
    const name = screen.getByDisplayValue(/DeepSeek/)
    fireEvent.change(name, { target: { value: 'My Grove' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(b.setCustomThemes).toHaveBeenCalled()
    const saved = b.setCustomThemes.mock.calls[0]![0] as ThemeFamily[]
    expect(saved[0]!.name).toBe('My Grove')
    expect(b.setThemeHalf).toHaveBeenCalledWith('light', saved[0]!.id)
    expect(b.setThemeHalf).toHaveBeenCalledWith('dark', saved[0]!.id)
  })

  it('duplicates, edits advanced tokens, and cancels without writing', () => {
    const b = mount('system')
    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '高级 token' }))
    const override = screen.getAllByPlaceholderText('Auto')[0]!
    fireEvent.change(override, { target: { value: '#112233' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(b.setCustomThemes).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('edits, exports, and deletes a custom family', async () => {
    const b = mount('system', { customThemes: [CUSTOM] })
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByDisplayValue('Grove'), { target: { value: 'Grove 2' } })
    const colors = b.container.querySelectorAll('input[type="color"]')
    fireEvent.change(colors[0]!, { target: { value: '#123456' } })
    fireEvent.change(colors[1]!, { target: { value: '#654321' } })
    fireEvent.change(colors[2]!, { target: { value: '#abcdef' } })
    fireEvent.change(colors[3]!, { target: { value: '#fedcba' } })
    fireEvent.change(colors[4]!, { target: { value: '#111111' } })
    fireEvent.change(colors[5]!, { target: { value: '#eeeeee' } })
    fireEvent.change(b.container.querySelector('fieldset input[type="range"]')!, { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(b.setCustomThemes).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '导出' }))
    await vi.waitFor(() => { expect(writeClipboard).toHaveBeenCalled() })
    expect(String(vi.mocked(writeClipboard).mock.calls[0]![0])).toContain('Grove')

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(b.setCustomThemes).toHaveBeenLastCalledWith([])
  })

  it('imports a valid family JSON and ignores invalid files', async () => {
    const b = mount('system')
    fireEvent.click(screen.getByRole('button', { name: '导入主题' }))
    const input = b.container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [] } })
    })
    const file = new File([serializeThemeFamily(CUSTOM)], 'grove.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await vi.waitFor(() => { expect(b.setCustomThemes).toHaveBeenCalled() })
    const imported = b.setCustomThemes.mock.calls[0]![0] as ThemeFamily[]
    expect(imported[0]!.id).toBe('grove')

    const bad = new File(['{not json'], 'bad.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } })
    })
    expect(b.setCustomThemes).toHaveBeenCalledTimes(1)
  })

  it('writes glass opacity and typography, including the advanced extras toggle', () => {
    const b = mount('system')
    fireEvent.change(screen.getByRole('slider', { name: '玻璃透明度' }), { target: { value: '55' } })
    expect(b.setGlassOpacity).toHaveBeenCalledWith(55)
    fireEvent.click(screen.getAllByRole('button', { name: '重置' })[0]!)
    expect(b.setGlassOpacity).toHaveBeenCalledWith(80)

    const fonts = screen.getAllByPlaceholderText('系统默认')
    fireEvent.change(fonts[0]!, { target: { value: 'Inter' } })
    expect(b.setTypography).toHaveBeenCalledWith({ fontFamilySans: 'Inter' })
    fireEvent.change(fonts[1]!, { target: { value: 'JetBrains Mono' } })
    expect(b.setTypography).toHaveBeenCalledWith({ fontFamilyCode: 'JetBrains Mono' })
    fireEvent.change(screen.getByLabelText('字号'), { target: { value: '18' } })
    expect(b.setTypography).toHaveBeenCalledWith({ fontSizeInterface: 18 })
    fireEvent.change(screen.getByLabelText('代码字号'), { target: { value: '14' } })
    expect(b.setTypography).toHaveBeenCalledWith({ fontSizeCode: 14 })

    fireEvent.click(screen.getByRole('button', { name: '高级' }))
    expect(localStorage.getItem('dsh:typography-advanced')).toBe('1')
    const extras = screen.getAllByPlaceholderText('系统默认')
    fireEvent.change(extras[2]!, { target: { value: 'Georgia' } })
    expect(b.setTypography).toHaveBeenCalledWith({ fontFamilyComposer: 'Georgia' })
    fireEvent.change(extras[3]!, { target: { value: 'IBM Plex Mono' } })
    expect(b.setTypography).toHaveBeenCalledWith({ fontFamilyTerminal: 'IBM Plex Mono' })
    const throwing = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    vi.stubGlobal('localStorage', throwing)
    fireEvent.click(screen.getByRole('button', { name: '高级' }))
    vi.unstubAllGlobals()
    fireEvent.click(screen.getAllByRole('button', { name: '重置' })[1]!)
    expect(b.setTypography).toHaveBeenCalledWith({
      fontFamilySans: '',
      fontFamilyCode: '',
      fontSizeInterface: 16,
      fontSizeCode: 13,
      fontFamilyComposer: '',
      fontFamilyTerminal: '',
    })
  })
})
