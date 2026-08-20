import { describe, expect, it } from 'vitest'
import { authorizeMcpHttp, type McpOAuthRuntime } from '../src/oauth.ts'

const RESOURCE = 'https://mcp.example.test/mcp'
const METADATA = 'https://mcp.example.test/.well-known/oauth-protected-resource/mcp'
const ISSUER = 'https://auth.example.test'
const AUTHORIZE = `${ISSUER}/oauth/authorize`
const TOKEN = `${ISSUER}/oauth/token`
const REGISTER = `${ISSUER}/oauth/register`

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function runtime(overrides: {
  probeStatus?: number
  probeHeaders?: Record<string, string>
  tokenStatus?: number
  tokenBody?: unknown
}): { runtime: McpOAuthRuntime; opened: string[] } {
  const opened: string[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url === RESOURCE && method === 'POST') {
      const headers = overrides.probeHeaders ?? {
        'www-authenticate': `Bearer error="invalid_token", resource_metadata="${METADATA}"`,
      }
      return jsonResponse(overrides.probeStatus ?? 401, { error: 'missing bearer token' }, headers)
    }
    if (url === METADATA && method === 'GET') {
      return jsonResponse(200, { resource: RESOURCE, authorization_servers: [ISSUER], scopes_supported: ['mcp:use'] })
    }
    if (url === `${ISSUER}/.well-known/oauth-authorization-server` && method === 'GET') {
      return jsonResponse(200, {
        issuer: ISSUER,
        authorization_endpoint: AUTHORIZE,
        token_endpoint: TOKEN,
        registration_endpoint: REGISTER,
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'],
      })
    }
    if (url === REGISTER && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { redirect_uris?: string[] }
      expect(body.redirect_uris).toEqual(['http://127.0.0.1:9/callback'])
      return jsonResponse(201, { client_id: 'client-1', token_endpoint_auth_method: 'none' })
    }
    if (url === TOKEN && method === 'POST') {
      const params = new URLSearchParams(String(init?.body))
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('code')).toBe('auth-code')
      expect(params.get('client_id')).toBe('client-1')
      expect(params.get('redirect_uri')).toBe('http://127.0.0.1:9/callback')
      expect(params.get('resource')).toBe(RESOURCE)
      expect(params.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]+$/)
      return jsonResponse(
        overrides.tokenStatus ?? 200,
        overrides.tokenBody ?? {
          access_token: 'tok-live',
          refresh_token: 'ref-live',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      )
    }
    throw new Error(`unexpected fetch ${method} ${url}`)
  }
  return {
    opened,
    runtime: {
      fetch: fetchImpl,
      openBrowser: (url) => { opened.push(url) },
      createListener: async () => ({
        redirectUri: 'http://127.0.0.1:9/callback',
        waitForCode: async (state) => {
          expect(state.length).toBeGreaterThan(8)
          return 'auth-code'
        },
        close: async () => {},
      }),
    },
  }
}

describe('authorizeMcpHttp', () => {
  it('runs PKCE against discovered metadata and returns the access token', async () => {
    const { runtime: oauth, opened } = runtime({})
    const tokens = await authorizeMcpHttp(RESOURCE, oauth)
    expect(tokens.access_token).toBe('tok-live')
    expect(tokens.refresh_token).toBe('ref-live')
    expect(opened).toHaveLength(1)
    const authorize = new URL(opened[0]!)
    expect(authorize.origin + authorize.pathname).toBe(AUTHORIZE)
    expect(authorize.searchParams.get('response_type')).toBe('code')
    expect(authorize.searchParams.get('client_id')).toBe('client-1')
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:9/callback')
    expect(authorize.searchParams.get('scope')).toBe('mcp:use')
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('resource')).toBe(RESOURCE)
    expect(authorize.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('refuses a server that does not challenge for OAuth', async () => {
    const { runtime: oauth } = runtime({ probeStatus: 200 })
    await expect(authorizeMcpHttp(RESOURCE, oauth)).rejects.toThrow(/did not request OAuth/)
  })

  it('falls back to well-known metadata when WWW-Authenticate is absent', async () => {
    const { runtime: oauth } = runtime({ probeHeaders: {} })
    const tokens = await authorizeMcpHttp(RESOURCE, oauth)
    expect(tokens.access_token).toBe('tok-live')
  })
})
