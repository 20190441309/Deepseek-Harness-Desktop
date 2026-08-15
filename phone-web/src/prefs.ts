import type { Lang } from './locale.ts'

export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'dsh.phone.theme'
const LANG_KEY = 'dsh.phone.lang'
const SESSION_KEY = 'dsh.sessions.current'

export function loadTheme(): Theme {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
}

export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') {
    return theme
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  const resolved = resolvedTheme(theme)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'light' ? '#f4f6fa' : '#0b0d12')
  }
}

export function loadLang(): Lang {
  return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang)
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
}

export function loadCurrentSession(): string {
  return localStorage.getItem(SESSION_KEY) || ''
}

export function saveCurrentSession(id: string | null): void {
  if (!id) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, id)
}
