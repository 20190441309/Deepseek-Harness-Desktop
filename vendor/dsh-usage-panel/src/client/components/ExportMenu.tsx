// dsh-usage-panel · export menu (P1-⑧).
// JSON / daily CSV / model CSV; CSV cells are formula-injection-guarded,
// RFC 4180 escaped, and files carry a UTF-8 BOM.
import { useState } from 'react'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Overview } from '../../shared/contract.ts'
import { buildDailyCsv, buildJson, buildModelCsv, download } from '../export.ts'
import type { I18n } from '../locales.ts'
import * as React from 'react'

interface ExportMenuProps {
  overview: Overview
  i18n: I18n
}

export function ExportMenu({ overview, i18n }: ExportMenuProps): JSX.Element {
  const t = i18n.t
  const [open, setOpen] = useState(false)

  const run = (kind: 'json' | 'daily' | 'models'): void => {
    if (kind === 'json') download(t('export.file.json'), buildJson(overview), 'application/json')
    else if (kind === 'daily') download(t('export.file.daily'), buildDailyCsv(overview.days), 'text/csv')
    else download(t('export.file.models'), buildModelCsv(overview.byModel), 'text/csv')
    setOpen(false)
  }

  return (
    <Menu
      open={open}
      align="end"
      portal
      anchor={
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {t('export.button')}
        </Button>
      }
      items={[
        { id: 'json', label: t('export.json') },
        { id: 'daily', label: t('export.daily') },
        { id: 'models', label: t('export.models') },
      ]}
      onSelect={(id) => {
        if (id === 'json' || id === 'daily' || id === 'models') run(id)
      }}
      onClose={() => setOpen(false)}
    />
  )
}
