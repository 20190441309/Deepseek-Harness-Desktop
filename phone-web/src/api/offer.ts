const OFFER_VERSION = 1

export type Offer = {
  v: number
  token: string
  mode: 'relay' | 'lan'
  relay: string
}

function decodeOffer(raw: string): Offer | null {
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
    const pad = padded.length % 4 === 0 ? padded : padded + '='.repeat(4 - (padded.length % 4))
    const binary = atob(pad)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (!json || json.v !== OFFER_VERSION || typeof json.token !== 'string' || !json.token) {
      return null
    }
    return {
      v: OFFER_VERSION,
      token: json.token,
      mode: json.mode === 'relay' ? 'relay' : 'lan',
      relay: typeof json.relay === 'string' ? json.relay : '',
    }
  } catch {
    return null
  }
}

/** Read the pairing secret from `#offer=`. The token never goes in the query string. */
export function offerFromHash(hash: string): Offer | null {
  const match = String(hash || '').match(/(?:^|#|&)offer=([^&]+)/)
  return match ? decodeOffer(match[1]) : null
}

export async function loginWithOffer(token: string): Promise<boolean> {
  const body = new URLSearchParams()
  body.set('token', token)
  const response = await fetch('/__remote__/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    credentials: 'same-origin',
    redirect: 'follow',
  })
  return response.ok || response.redirected
}
