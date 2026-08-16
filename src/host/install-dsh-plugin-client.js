'use strict';

/**
 * HTTP client and result helpers for install_dsh_plugin.
 * Kept free of Cordis and dsh-tools so node:test can load it.
 */

const GITHUB_SPEC_PATTERN = /^github:[^/#\s]+\/[^/#\s]+(?:#[^\s#]+)?$/;

/**
 * The control channel installs marketplace plugins only: a bare github:
 * owner/repo spec with an optional #ref. Anything else (registry names,
 * tarballs, local paths, git URLs) must never reach `pnpm add`.
 * @param spec - candidate install spec.
 * @returns whether the spec is a github: owner/repo reference.
 */
function isValidGithubSpec(spec) {
  return GITHUB_SPEC_PATTERN.test(String(spec || '').trim());
}

function emptyInstallResult(error, spec = '') {
  return {
    ok: false,
    needsAllowBuilds: false,
    allowBuilds: [],
    spec,
    error,
    log: '',
    restarting: false,
  };
}

function normalizeInstallResult(result, spec) {
  const needsAllowBuilds = Boolean(result?.needsAllowBuilds);
  const ok = Boolean(result?.ok);
  return {
    ok,
    needsAllowBuilds,
    allowBuilds: Array.isArray(result?.allowBuilds) ? result.allowBuilds.map(String) : [],
    spec: String(result?.spec || spec || ''),
    error: String(result?.error || ''),
    log: String(result?.log || ''),
    restarting: ok && !needsAllowBuilds,
  };
}

function renderInstall(value) {
  if (value.needsAllowBuilds) {
    const keys = value.allowBuilds.length > 0 ? value.allowBuilds.join(', ') : '(unparsed)';
    return `pnpm blocked prepare scripts for ${value.spec}. Ask the user, then retry install_dsh_plugin with allowBuilds: ${keys}.`;
  }
  if (value.ok) {
    return `Installed ${value.spec} into the web profile. The desktop app will restart to load it.`;
  }
  return `Install failed for ${value.spec || '(missing spec)'}: ${value.error || 'unknown error'}`;
}

/**
 * POST one install request to the desktop control endpoint.
 * @param url - loopback base URL from DSH_DESKTOP_INSTALL_URL.
 * @param token - bearer token from DSH_DESKTOP_INSTALL_TOKEN.
 * @param spec - github:owner/repo[#sha] spec.
 * @param allowBuilds - optional pnpm allowBuilds keys.
 * @returns the desktop install result JSON.
 */
async function requestDesktopInstall(url, token, spec, allowBuilds = []) {
  const endpoint = new URL('/install', url);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ spec, allowBuilds }),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`desktop install control returned non-JSON (${response.status})`);
  }
  if (body && typeof body === 'object') {
    return body;
  }
  throw new Error(`desktop install control failed (${response.status})`);
}

/**
 * Validate the spec, call the control endpoint, and normalize the result.
 * @param control - loopback URL and token.
 * @param spec - github: spec from the model.
 * @param allowBuilds - optional pnpm allowBuilds keys.
 * @param request - injectable HTTP client.
 */
async function executeInstallDshPlugin(control, spec, allowBuilds = [], request = requestDesktopInstall) {
  const trimmed = String(spec || '').trim();
  if (!trimmed) {
    return emptyInstallResult('missing install spec');
  }
  if (!isValidGithubSpec(trimmed)) {
    return emptyInstallResult('install spec must be github:owner/repo[#ref]', trimmed);
  }
  const result = await request(control.url, control.token, trimmed, allowBuilds ?? []);
  return normalizeInstallResult(result, trimmed);
}

module.exports = {
  emptyInstallResult,
  isValidGithubSpec,
  normalizeInstallResult,
  renderInstall,
  requestDesktopInstall,
  executeInstallDshPlugin,
};
