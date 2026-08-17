// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { hostHasFitSize } from '../src/client/fit.ts'

describe('hostHasFitSize', () => {
  it('rejects a 0×0 host and accepts a used box', () => {
    const el = document.createElement('div')
    expect(hostHasFitSize(el)).toBe(false)
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 80 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 24 })
    expect(hostHasFitSize(el)).toBe(true)
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 0 })
    expect(hostHasFitSize(el)).toBe(false)
  })
})
