const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DROPPED } = require('./plugins');
const { classifyPlugin, countCategories } = require('./marketplace-categories');

const SEARCH_QUERY = 'topic:dsh-plugin';
const CACHE_VERSION = 2;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const PROBE_CONCURRENCY = 8;
const USER_AGENT = 'Deepseek-Harness-Desktop';

function cachePath() {
  return path.join(app.getPath('userData'), 'marketplace-cache.json');
}

function readCache() {
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
    if (!cache || !Array.isArray(cache.items) || cache.items.length === 0) {
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

function cacheIsCurrent(cache) {
  return Boolean(
    cache
    && cache.version === CACHE_VERSION
    && Date.now() - Number(cache.fetchedAt || 0) < CACHE_TTL_MS,
  );
}

function writeCache(payload) {
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
  const tmp = `${cachePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: CACHE_VERSION, ...payload }, null, 2), 'utf8');
  fs.renameSync(tmp, cachePath());
}

function starCount(item) {
  const n = Number(item && item.stars);
  return Number.isFinite(n) ? n : 0;
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    if (!item || !item.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push({ ...item, stars: starCount(item) });
  }
  return result;
}

function githubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function githubJson(url, token, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: githubHeaders(token),
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function searchTopic(token) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(SEARCH_QUERY)}&sort=stars&order=desc&per_page=${PAGE_SIZE}&page=${page}`;
    const result = await githubJson(url, token);
    if (!result.ok) {
      const message = result.status === 403 || result.status === 429
        ? 'GitHub 请求过于频繁，稍后重试或在市场页填写 Token'
        : `GitHub 搜索失败（${result.status}）`;
      const error = new Error(message);
      error.status = result.status;
      error.partial = items;
      throw error;
    }
    const pageItems = Array.isArray(result.body?.items) ? result.body.items : [];
    items.push(...pageItems);
    if (pageItems.length < PAGE_SIZE || items.length >= Number(result.body?.total_count || 0)) {
      break;
    }
  }
  return items;
}

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function probePackage(owner, repo, branch) {
  const branches = [...new Set([branch, 'main', 'master'].filter(Boolean))];
  for (const ref of branches) {
    const text = await fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/package.json`);
    if (!text) {
      continue;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function next() {
    const current = index;
    index += 1;
    if (current >= items.length) {
      return;
    }
    results[current] = await worker(items[current], current);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

function licenseName(repo) {
  const license = repo.license;
  if (!license) {
    return '';
  }
  return license.spdx_id && license.spdx_id !== 'NOASSERTION' ? license.spdx_id : (license.name || '');
}

function toEntry(repo, pkg) {
  const owner = repo.owner?.login || repo.full_name.split('/')[0];
  const name = repo.name;
  const packageName = typeof pkg?.name === 'string' ? pkg.name : '';
  const keywords = Array.isArray(pkg?.keywords) ? pkg.keywords : [];
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const isBundle = Boolean(pkg?.dsh?.bundle?.patch);
  const dropped = DROPPED.includes(packageName);
  const branch = repo.default_branch || 'main';
  return {
    id: repo.full_name,
    owner,
    repo: name,
    description: repo.description || '',
    stars: starCount({ stars: repo.stargazers_count }),
    updated: repo.updated_at || '',
    pushed: repo.pushed_at || repo.updated_at || '',
    license: licenseName(repo),
    defaultBranch: branch,
    sha: '',
    packageName,
    keywords,
    topics,
    homepage: repo.html_url,
    installSpec: `github:${repo.full_name}#${branch}`,
    isBundle,
    dropped,
    category: classifyPlugin({
      topics,
      keywords,
      name: packageName || name,
      repo: name,
      packageName,
      description: repo.description || '',
    }),
  };
}

function decorate(items) {
  return (items || []).map((item) => ({
    ...item,
    category: classifyPlugin(item),
  }));
}

function payloadFromItems(items, extra = {}) {
  const visible = dedupeItems(items.filter((item) => !item.dropped));
  return {
    ok: true,
    query: SEARCH_QUERY,
    topicUrl: 'https://github.com/topics/dsh-plugin',
    items: visible,
    categories: countCategories(visible),
    fetchedAt: extra.fetchedAt || Date.now(),
    stale: Boolean(extra.stale),
    warning: extra.warning || '',
  };
}

/**
 * List dsh-plugin topic repositories, probing package.json for bundle metadata.
 * @param {{ token?: string, refresh?: boolean }} options
 */
async function listMarketplace(options = {}) {
  const cache = readCache();
  if (cache && !options.refresh && cacheIsCurrent(cache)) {
    return payloadFromItems(decorate(cache.items), { fetchedAt: cache.fetchedAt });
  }

  try {
    const repos = await searchTopic(options.token);
    const probed = await mapLimit(repos, PROBE_CONCURRENCY, async (repo) => {
      const owner = repo.owner?.login;
      const name = repo.name;
      if (!owner || !name) {
        return null;
      }
      const pkg = await probePackage(owner, name, repo.default_branch);
      return toEntry(repo, pkg);
    });
    const items = probed.filter(Boolean);
    const fetchedAt = Date.now();
    writeCache({ fetchedAt, query: SEARCH_QUERY, items });
    return payloadFromItems(items, { fetchedAt });
  } catch (error) {
    if (cache?.items?.length) {
      return payloadFromItems(decorate(cache.items), {
        fetchedAt: cache.fetchedAt,
        stale: true,
        warning: error.message,
      });
    }
    const rawPartial = Array.isArray(error.partial) ? error.partial : [];
    if (rawPartial.length) {
      const items = rawPartial
        .filter((repo) => repo?.owner?.login && repo.name)
        .map((repo) => toEntry(repo, null));
      return payloadFromItems(items, {
        fetchedAt: Date.now(),
        stale: true,
        warning: error.message,
      });
    }
    return {
      ok: false,
      query: SEARCH_QUERY,
      topicUrl: 'https://github.com/topics/dsh-plugin',
      items: [],
      categories: countCategories([]),
      fetchedAt: 0,
      stale: false,
      warning: error.message,
    };
  }
}

async function resolveCommitSha(owner, repo, ref, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      headers: {
        ...githubHeaders(token),
        Accept: 'application/vnd.github.sha',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return '';
    }
    const sha = (await response.text()).trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  SEARCH_QUERY,
  CACHE_TTL_MS,
  listMarketplace,
  resolveCommitSha,
  classifyPlugin,
};
