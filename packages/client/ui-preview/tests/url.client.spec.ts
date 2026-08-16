import { describe, expect, it } from 'vitest'
import { normalizeLocalPreviewUrl } from '../src/client/url.ts'

describe('normalizeLocalPreviewUrl', () => {
  it('adds http for bare loopback hosts and leaves qualified URLs alone', () => {
    expect(normalizeLocalPreviewUrl('localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeLocalPreviewUrl('127.0.0.1:3000/app')).toBe('http://127.0.0.1:3000/app')
    expect(normalizeLocalPreviewUrl('0.0.0.0:4173')).toBe('http://0.0.0.0:4173')
    expect(normalizeLocalPreviewUrl('[::1]:8080')).toBe('http://[::1]:8080')
    expect(normalizeLocalPreviewUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(normalizeLocalPreviewUrl('  ')).toBe('')
    expect(normalizeLocalPreviewUrl('example.com')).toBe('example.com')
  })
})
