/**
 * Surfaces tab bar caption: parent drag, interactive children no-drag.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SurfaceTabs.module.css', import.meta.url)), 'utf8')

describe('SurfaceTabs.module.css caption regions', () => {
  it('drags the tab bar and keeps tab, add, and close controls no-drag', () => {
    expect(css).toMatch(/\.bar[\s\S]*?-webkit-app-region:\s*drag/)
    expect(css).toMatch(/\.interactive,[\s\S]*?\.tab,[\s\S]*?\.add,[\s\S]*?\.close,[\s\S]*?\.label[\s\S]*?-webkit-app-region:\s*no-drag/)
  })
})
