/**
 * Theme-family grid: two-ball cards, create / import / duplicate / delete.
 */
import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { getReservedThemeIds } from '../builtin-families.ts'
import {
  duplicateThemeFamily, normalizeImportedThemeFamily,
  parseThemeFamilyJson, replaceCustomTheme, serializeThemeFamily,
  type ThemeFamily,
} from '../theme-family.ts'
import { ThemeEditor } from './ThemeEditor.tsx'
import type { ThemeKey } from './locales.ts'
import css from './AppearanceSection.module.css'

/**
 * Render the theme library grid and editor.
 * @param props - families, selected halves, and write callbacks.
 * @returns the library tree.
 */
export function ThemeLibrary({
  families,
  customThemes,
  activeLightThemeId,
  activeDarkThemeId,
  t,
  setThemeHalf,
  setCustomThemes,
}: {
  families: readonly ThemeFamily[]
  customThemes: readonly ThemeFamily[]
  activeLightThemeId: string
  activeDarkThemeId: string
  t: (key: ThemeKey) => string
  setThemeHalf: (mode: 'light' | 'dark', id: string) => void
  setCustomThemes: (families: ThemeFamily[]) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<ThemeFamily | null>(null)

  const reserved = new Set([...getReservedThemeIds(), ...customThemes.map(family => family.id)])

  const startCreate = (): void => {
    const source = families.find(family => family.id === activeDarkThemeId)
      ?? families.find(family => family.id === activeLightThemeId)
      ?? families[0]!
    setDraft(duplicateThemeFamily(source, reserved))
  }

  const saveDraft = (next: ThemeFamily): void => {
    setCustomThemes(replaceCustomTheme(customThemes, next))
    setThemeHalf('light', next.id)
    setThemeHalf('dark', next.id)
    setDraft(null)
  }

  const importFile = async (file: File): Promise<void> => {
    try {
      const raw = await file.text()
      const imported = normalizeImportedThemeFamily(parseThemeFamilyJson(raw), reserved)
      setCustomThemes(replaceCustomTheme(customThemes, imported))
    } catch {
      /* invalid JSON or schema — leave the library unchanged */
    }
  }

  return (
    <div className={css.library}>
      <div className={css.libraryHeader}>
        <h3 className={css.subtitle}>{t('library.title')}</h3>
        <div className={css.libraryActions}>
          <Button type="button" variant="outline" onClick={startCreate}>{t('library.create')}</Button>
          <Button type="button" variant="outline" onClick={() => { fileRef.current?.click() }}>
            {t('library.import')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void importFile(file)
            }}
          />
        </div>
      </div>
      <div className={css.grid}>
        {families.map(family => (
          <article key={family.id} className={css.card}>
            <p className={css.cardName}>{family.name}</p>
            <div className={css.balls}>
              <button
                type="button"
                className={clsx(css.ball, activeLightThemeId === family.id && css.ballActive)}
                style={{ background: `linear-gradient(135deg, ${family.light.background}, ${family.light.accent})` }}
                aria-label={`${family.name} ${t('editor.light')}`}
                aria-pressed={activeLightThemeId === family.id}
                onClick={() => { setThemeHalf('light', family.id) }}
              >
                {activeLightThemeId === family.id ? <span className={css.sun} aria-hidden="true" /> : null}
              </button>
              <button
                type="button"
                className={clsx(css.ball, activeDarkThemeId === family.id && css.ballActive)}
                style={{ background: `linear-gradient(135deg, ${family.dark.background}, ${family.dark.accent})` }}
                aria-label={`${family.name} ${t('editor.dark')}`}
                aria-pressed={activeDarkThemeId === family.id}
                onClick={() => { setThemeHalf('dark', family.id) }}
              >
                {activeDarkThemeId === family.id ? <span className={css.moon} aria-hidden="true" /> : null}
              </button>
            </div>
            <div className={css.cardActions}>
              <button
                type="button"
                className={css.iconButton}
                aria-label={t('library.duplicate')}
                onClick={() => { setDraft(duplicateThemeFamily(family, reserved)) }}
              >
                +
              </button>
              {family.origin === 'custom' ? (
                <>
                  <button
                    type="button"
                    className={css.iconButton}
                    aria-label={t('library.edit')}
                    onClick={() => { setDraft(family) }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={css.iconButton}
                    aria-label={t('library.export')}
                    onClick={() => { void writeClipboard(serializeThemeFamily(family)) }}
                  >
                    ↗
                  </button>
                  <button
                    type="button"
                    className={css.iconButton}
                    aria-label={t('library.delete')}
                    onClick={() => {
                      setCustomThemes(customThemes.filter(item => item.id !== family.id))
                    }}
                  >
                    ×
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {draft !== null ? (
        <ThemeEditor
          family={draft}
          t={t}
          onChange={setDraft}
          onSave={() => { saveDraft(draft) }}
          onCancel={() => { setDraft(null) }}
        />
      ) : null}
    </div>
  )
}
