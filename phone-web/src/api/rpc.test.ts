import { describe, expect, it, vi } from 'vitest'
import { mintRpcId } from './rpc.ts'

describe('mintRpcId', () => {
  it('works when crypto.randomUUID is missing', () => {
    const crypto = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(7)
        return bytes
      },
    })
    expect(globalThis.crypto.randomUUID).toBeUndefined()
    expect(mintRpcId()).toMatch(/^[0-9a-f-]{36}$/)
    vi.stubGlobal('crypto', crypto)
  })
})
