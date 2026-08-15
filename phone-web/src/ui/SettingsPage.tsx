import type { Copy, Lang } from '../locale.ts'
import type { Theme } from '../prefs.ts'

type Props = {
  t: Copy
  lang: Lang
  theme: Theme
  origin: string
  mode: 'lan' | 'relay'
  onClose: () => void
  onTheme: (theme: Theme) => void
  onLang: (lang: Lang) => void
}

export function SettingsPage({ t, lang, theme, origin, mode, onClose, onTheme, onLang }: Props) {
  return (
    <div className="settings">
      <header className="top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t.cancel}>
          ←
        </button>
        <h1>{t.settings}</h1>
      </header>
      <div className="scroll pad">
        <h2 className="workspace">{t.appearance}</h2>
        <div className="segment">
          {(['light', 'dark', 'system'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={theme === value ? 'on' : ''}
              onClick={() => { onTheme(value) }}
            >
              {value === 'light' ? t.light : value === 'dark' ? t.dark : t.system}
            </button>
          ))}
        </div>
        <h2 className="workspace">{t.language}</h2>
        <div className="segment">
          <button type="button" className={lang === 'zh' ? 'on' : ''} onClick={() => { onLang('zh') }}>{t.chinese}</button>
          <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => { onLang('en') }}>{t.english}</button>
        </div>
        <h2 className="workspace">{t.about}</h2>
        <p className="lead">{t.connected}</p>
        <p className="about-row"><span>{t.origin}</span> {origin}</p>
        <p className="about-row">{mode === 'lan' ? t.modeLan : t.modeRelay}</p>
        <p className="lead">{t.unbindHint}</p>
      </div>
    </div>
  )
}
