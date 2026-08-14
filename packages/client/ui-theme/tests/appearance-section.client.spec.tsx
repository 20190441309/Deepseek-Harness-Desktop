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
    active: { colorScheme: overrides.preference === 'dark' ? 'dark' : 'light' },
    activeLightThemeId: 'deepseek',
    activeDarkThemeId: 'deepseek',
    customThemes,
    glassOpacity: DEFAULT_THEME_SETTINGS.glassOpacity,
    wallpaperImage: '',
    wallpaperBlur: 0,
    wallpaperPixelate: 0,
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
  const previewTheme = vi.fn()
  const setGlassOpacity = vi.fn()
  const setWallpaper = vi.fn()
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
    previewTheme,
    setGlassOpacity,
    setWallpaper,
    setTypography,
  }
  const view = render(<AppearanceSection {...props} />)
  return { store, setTheme, setThemeHalf, setCustomThemes, previewTheme, setGlassOpacity, setWallpaper, setTypography, ...view }
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

  it('previews the draft live while the editor is open and clears on close', () => {
    const b = mount('dark')
    fireEvent.click(screen.getByRole('button', { name: '创建主题' }))
    expect(screen.getByText(/正处于深色模式/)).toBeDefined()
    expect(b.previewTheme).toHaveBeenCalledTimes(1)
    const opened = b.previewTheme.mock.calls[0]![0] as ThemeFamily
    expect(opened.origin).toBe('custom')

    const colors = b.container.querySelectorAll('input[type="color"]')
    fireEvent.change(colors[0]!, { target: { value: '#e60000' } })
    const updated = b.previewTheme.mock.calls.at(-1)![0] as ThemeFamily
    expect(updated.light.accent).toBe('#e60000')

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(b.previewTheme).toHaveBeenLastCalledWith(null)
  })

  it('clears the preview when saving and marks the current mode half', () => {
    const b = mount('dark')
    expect(screen.getAllByText('当前模式').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '创建主题' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(b.setCustomThemes).toHaveBeenCalled()
    expect(b.previewTheme).toHaveBeenLastCalledWith(null)
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

  it('hides wallpaper sliders until an image is set, then writes blur and pixelate', async () => {
    const b = mount('system')
    expect(screen.queryByRole('slider', { name: '毛玻璃程度' })).toBeNull()
    expect(screen.queryByRole('button', { name: '清除' })).toBeNull()
    const ignored = b.container.querySelector('input[accept="image/png,image/jpeg,image/webp,image/gif"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(ignored, { target: { files: [] } })
    })
    expect(b.setWallpaper).not.toHaveBeenCalled()

    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    act(() => {
      b.store.actions.sync(snap({ wallpaperImage: png, wallpaperBlur: 20, wallpaperPixelate: 10 }), 1)
    })
    expect(screen.getByRole('img', { name: '背景图' })).toBeDefined()
    fireEvent.change(screen.getByRole('slider', { name: '毛玻璃程度' }), { target: { value: '40' } })
    expect(b.setWallpaper).toHaveBeenCalledWith({ wallpaperBlur: 40 })
    fireEvent.change(screen.getByRole('slider', { name: '像素化程度' }), { target: { value: '70' } })
    expect(b.setWallpaper).toHaveBeenCalledWith({ wallpaperPixelate: 70 })
    fireEvent.click(screen.getByRole('button', { name: '清除' }))
    expect(b.setWallpaper).toHaveBeenCalledWith({ wallpaperImage: '' })
    fireEvent.click(screen.getAllByRole('button', { name: '重置' })[0]!)
    expect(b.setWallpaper).toHaveBeenCalledWith({ wallpaperBlur: 0, wallpaperPixelate: 0 })
  })

  it('encodes a picked wallpaper file and ignores a rejected file', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const bytes = Uint8Array.from(atob(png.split(',')[1]!), char => char.charCodeAt(0))
    const b = mount('system')
    fireEvent.click(screen.getByRole('button', { name: '选择图片' }))
    const input = b.container.querySelector('input[accept="image/png,image/jpeg,image/webp,image/gif"]') as HTMLInputElement
    const file = new File([bytes], 'dot.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await vi.waitFor(() => { expect(b.setWallpaper).toHaveBeenCalled() })
    expect(b.setWallpaper.mock.calls[0]![0]).toMatchObject({ wallpaperImage: expect.stringMatching(/^data:image\//) })

    const bad = new File(['nope'], 'notes.txt', { type: 'text/plain' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } })
    })
    expect(b.setWallpaper).toHaveBeenCalledTimes(1)
  })
})
