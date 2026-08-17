/**
 * Titlebar trailing cluster packing: flex gap and no-drag so the capsules
 * stay clickable on the desktop caption strip.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')

function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const found = new Map<string, string>()
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
  }
  return found.size === 0 ? undefined : found
}

describe('AppFrame.module.css titlebar trailing cluster', () => {
  it('packs cluster controls with an 8px gap and marks the cluster no-drag', () => {
    const trailing = declarations('.titlebarTrailing')
    expect(trailing?.get('gap')).toBe('8px')
    expect(trailing?.get('-webkit-app-region')).toBe('no-drag')
    expect(trailing?.get('display')).toBe('flex')
    expect(trailing?.get('margin-right')).toBe('var(--dshd-wco-controls, 8px)')
    expect(css).not.toContain('--dshd-wco-pad')
  })

  it('keeps the phone menu clickable beside the blank caption', () => {
    expect(declarations('.phoneMenu')?.get('-webkit-app-region')).toBe('no-drag')
  })

  it('stops the trailing cluster before an open surfaces column', () => {
    const open = declarations('.frame:not([data-surfaces-collapsed]) .titlebarTrailing')
    expect(open?.get('grid-column')).toBe('2 / 4')
    expect(open?.get('margin-right')).toBe('8px')
  })
})
