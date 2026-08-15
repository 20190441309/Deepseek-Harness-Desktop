export type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

function randomUuid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40)
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80)
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Phone remote is plain HTTP; do not call `crypto.randomUUID`. */
export function mintRpcId(): string {
  return randomUuid()
}

export async function callRpc<T>(method: string, payload: unknown): Promise<T> {
  const rpcId = mintRpcId()
  const response = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method,
      payload,
    }),
  })
  if (response.status === 401) {
    throw new Error('unauthorized')
  }
  if (!response.ok) {
    throw new Error(`${method} HTTP ${response.status}`)
  }
  const full = await response.json() as {
    type?: string
    rpcId?: string
    result?: RpcResult<T>
  }
  if (full.rpcId !== rpcId) {
    throw new Error(`${method} rpcId mismatch`)
  }
  const result = full.result
  if (!result || result.ok !== true) {
    throw new Error(result && 'error' in result ? result.error.message : `${method} failed`)
  }
  return result.value
}
