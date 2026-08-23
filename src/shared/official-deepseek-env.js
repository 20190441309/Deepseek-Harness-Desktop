'use strict';

/**
 * Official DeepSeek chat-completions host. Third-party OpenAI-compatible
 * gateways (Ayase, etc.) must not be written to DEEPSEEK_BASE_URL.
 */
const OFFICIAL_DEEPSEEK_HOST = 'api.deepseek.com';

/**
 * True when the shell gateway is official DeepSeek: empty/whitespace (public
 * API default) or a URL whose hostname is api.deepseek.com.
 * @param {unknown} baseUrl
 * @returns {boolean}
 */
function isOfficialDeepSeekBaseUrl(baseUrl) {
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!raw) return true;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  return parsed.hostname.toLowerCase() === OFFICIAL_DEEPSEEK_HOST;
}

/**
 * Copy shell credentials onto DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL only for
 * the official host. Custom providers keep their own settings; aliasing a
 * third-party gateway onto these names makes vision-fallback hit the wrong
 * origin with official model ids.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ apiKey?: string, baseUrl?: string }} [config]
 * @returns {NodeJS.ProcessEnv}
 */
function applyOfficialDeepSeekSpawnEnv(env, config = {}) {
  if (!isOfficialDeepSeekBaseUrl(config.baseUrl)) {
    return env;
  }
  if (config.apiKey) {
    env.DEEPSEEK_API_KEY = config.apiKey;
  }
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : '';
  if (baseUrl) {
    env.DEEPSEEK_BASE_URL = baseUrl;
  }
  return env;
}

module.exports = {
  OFFICIAL_DEEPSEEK_HOST,
  isOfficialDeepSeekBaseUrl,
  applyOfficialDeepSeekSpawnEnv,
};
