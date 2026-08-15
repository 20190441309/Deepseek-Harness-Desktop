import { describe, expect, it } from 'vitest'
import { offerFromHash } from './offer.ts'

function encodeOffer(payload: object): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

describe('offerFromHash', () => {
  it('reads the token from #offer= and ignores junk', () => {
    const hash = `#offer=${encodeOffer({ v: 1, token: 'secret', mode: 'relay', relay: 'http://relay.example:8411' })}`
    expect(offerFromHash(hash)).toEqual({
      v: 1,
      token: 'secret',
      mode: 'relay',
      relay: 'http://relay.example:8411',
    })
    expect(offerFromHash('#offer=@@@')).toBeNull()
    expect(offerFromHash('')).toBeNull()
  })
})
