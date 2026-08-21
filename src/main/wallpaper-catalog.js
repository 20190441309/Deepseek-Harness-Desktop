/** Fetch and parse wallpaper catalogs (Bing today/year, Wallhaven SFW, custom JSON). */

const USER_AGENT = 'Deepseek-Harness-Desktop';
const MAX_CATALOG_BYTES = 4_000_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_ITEMS_PER_SOURCE = 500;
const MAX_CUSTOM_CATALOGS = 8;
const MAX_REDIRECTS = 4;
const CATALOG_TIMEOUT_MS = 30000;
const IMAGE_TIMEOUT_MS = 20000;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

function allowHttp() {
  return process.env.DSHD_WALLPAPER_ALLOW_HTTP === '1';
}

/**
 * Built-in Bing archive pages. A `DSHD_BING_WALLPAPER_URL` override is one URL,
 * or two pages when it contains `{idx}` (replaced with `0` and `8`).
 * @returns {string[]}
 */
function bingCatalogUrls() {
  const override = process.env.DSHD_BING_WALLPAPER_URL;
  if (typeof override === 'string' && override.length > 0) {
    if (override.includes('{idx}')) {
      return [override.split('{idx}').join('0'), override.split('{idx}').join('8')];
    }
    return [override];
  }
  return [
    'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN',
    'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=8&n=8&mkt=zh-CN',
  ];
}

/**
 * Bing year-archive URL. `DSHD_BING_ARCHIVE_URL` may replace the template;
 * `{year}` is substituted with the requested year.
 * @param {number} year
 * @returns {string}
 */
function bingArchiveUrl(year) {
  const override = process.env.DSHD_BING_ARCHIVE_URL;
  const template = typeof override === 'string' && override.length > 0
    ? override
    : 'https://bing.npanuhin.me/CN-zh.{year}.json';
  return template.split('{year}').join(String(year));
}

/**
 * Wallhaven search URL. `DSHD_WALLHAVEN_SEARCH_URL` may replace the base.
 * `purity=100` is always set; `query.purity` is ignored.
 * @param {{ q?: string, categories?: string, page?: number }} query
 * @returns {string}
 */
function wallhavenSearchUrl(query) {
  const override = process.env.DSHD_WALLHAVEN_SEARCH_URL;
  const base = typeof override === 'string' && override.length > 0
    ? override
    : 'https://wallhaven.cc/api/v1/search';
  const categories = query.categories === '010' || query.categories === '001' || query.categories === '100'
    ? query.categories
    : '100';
  const page = Number.isInteger(query.page) && query.page >= 1 ? query.page : 1;
  try {
    const url = new URL(base);
    url.searchParams.set('purity', '100');
    url.searchParams.set('categories', categories);
    url.searchParams.set('sorting', 'toplist');
    url.searchParams.set('atleast', '1920x1080');
    url.searchParams.set('page', String(page));
    if (typeof query.q === 'string' && query.q.length > 0) {
      url.searchParams.set('q', query.q);
    }
    return url.href;
  } catch {
    return '';
  }
}

/**
 * @param {string} value
 * @returns {URL | null}
 */
function parseHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol === 'http:' && allowHttp()) return parsed;
  return null;
}

function isAllowedWallpaperUrl(value) {
  return parseHttpUrl(value) !== null;
}

function joinWarning(left, right) {
  if (!left) return right;
  if (!right) return left;
  return `${left}；${right}`;
}

function catalogError(source, detail) {
  const host = (() => {
    try {
      return new URL(source).host;
    } catch {
      return source;
    }
  })();
  return `壁纸目录 ${host} ${detail}`;
}

function resolveAgainst(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return '';
  }
}

function bingItem(image, sourceUrl) {
  if (!image || typeof image !== 'object') return null;
  if (image.wp === false) return null;
  const origin = sourceUrl;
  const urlbase = typeof image.urlbase === 'string' ? image.urlbase : '';
  let imageUrl = '';
  let thumbUrl = '';
  if (urlbase) {
    imageUrl = resolveAgainst(`${urlbase}_1920x1080.jpg`, origin);
    thumbUrl = resolveAgainst(`${urlbase}_400x240.jpg`, origin);
  } else if (typeof image.url === 'string' && image.url) {
    imageUrl = resolveAgainst(image.url, origin);
    thumbUrl = imageUrl;
  }
  if (!isAllowedWallpaperUrl(imageUrl) || !isAllowedWallpaperUrl(thumbUrl)) return null;
  const id = typeof image.hsh === 'string' && image.hsh
    ? image.hsh
    : (urlbase || imageUrl);
  const title = typeof image.title === 'string' && image.title
    ? image.title
    : (typeof image.copyright === 'string' ? image.copyright : '');
  return {
    id,
    title,
    copyright: typeof image.copyright === 'string' ? image.copyright : '',
    thumbUrl,
    imageUrl,
    source: sourceUrl,
  };
}

function nativeItem(item, sourceUrl) {
  if (!item || typeof item !== 'object') return null;
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const title = typeof item.title === 'string' ? item.title : '';
  const thumbUrl = typeof item.thumbUrl === 'string' ? resolveAgainst(item.thumbUrl, sourceUrl) : '';
  const imageUrl = typeof item.imageUrl === 'string' ? resolveAgainst(item.imageUrl, sourceUrl) : '';
  if (!id || !isAllowedWallpaperUrl(thumbUrl) || !isAllowedWallpaperUrl(imageUrl)) return null;
  return {
    id,
    title,
    copyright: typeof item.copyright === 'string' ? item.copyright : '',
    thumbUrl,
    imageUrl,
    source: typeof item.source === 'string' && item.source ? item.source : sourceUrl,
  };
}

function bingArchiveItem(entry, sourceUrl) {
  if (!entry || typeof entry !== 'object') return null;
  const date = typeof entry.date === 'string' ? entry.date : '';
  if (!date) return null;
  const bingUrl = typeof entry.bing_url === 'string' ? resolveAgainst(entry.bing_url, sourceUrl) : '';
  const fallback = typeof entry.url === 'string' ? resolveAgainst(entry.url, sourceUrl) : '';
  const chosen = isAllowedWallpaperUrl(bingUrl) ? bingUrl : fallback;
  if (!isAllowedWallpaperUrl(chosen)) return null;
  return {
    id: `bing-${date}`,
    title: typeof entry.title === 'string' ? entry.title : '',
    copyright: typeof entry.copyright === 'string' ? entry.copyright : '',
    thumbUrl: chosen,
    imageUrl: chosen,
    source: 'bing',
  };
}

function wallhavenItem(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.id == null || entry.id === '') return null;
  const id = String(entry.id);
  const thumbs = entry.thumbs && typeof entry.thumbs === 'object' ? entry.thumbs : {};
  const thumbUrl = typeof thumbs.large === 'string' && thumbs.large
    ? thumbs.large
    : (typeof thumbs.small === 'string' ? thumbs.small : '');
  const imageUrl = typeof entry.path === 'string' ? entry.path : '';
  if (!isAllowedWallpaperUrl(thumbUrl) || !isAllowedWallpaperUrl(imageUrl)) return null;
  return {
    id: `wallhaven-${id}`,
    title: id,
    copyright: '',
    thumbUrl,
    imageUrl,
    source: 'wallhaven',
  };
}

/**
 * Parse a Bing HPImageArchive or native `{ items }` catalog body.
 * @param {unknown} body
 * @param {string} sourceUrl
 * @returns {{ items: Array<object>, error?: string }}
 */
function parseCatalogJson(body, sourceUrl) {
  if (!body || typeof body !== 'object') {
    return { items: [], error: catalogError(sourceUrl, '不是 JSON 对象') };
  }
  const record = /** @type {Record<string, unknown>} */ (body);
  if (Array.isArray(record.images)) {
    const items = [];
    for (const image of record.images) {
      const mapped = bingItem(image, sourceUrl);
      if (mapped) items.push(mapped);
      if (items.length >= MAX_ITEMS_PER_SOURCE) break;
    }
    return { items };
  }
  if (Array.isArray(record.items)) {
    const items = [];
    for (const item of record.items) {
      const mapped = nativeItem(item, sourceUrl);
      if (mapped) items.push(mapped);
      if (items.length >= MAX_ITEMS_PER_SOURCE) break;
    }
    return { items };
  }
  return { items: [], error: catalogError(sourceUrl, '不是壁纸目录') };
}

/**
 * Parse a Bing year-archive JSON array.
 * @param {unknown} body
 * @param {string} sourceUrl
 * @returns {{ items: Array<object>, error?: string }}
 */
function parseBingArchive(body, sourceUrl) {
  if (!Array.isArray(body)) {
    return { items: [], error: catalogError(sourceUrl, '不是壁纸目录') };
  }
  const items = [];
  for (const entry of body) {
    const mapped = bingArchiveItem(entry, sourceUrl);
    if (mapped) items.push(mapped);
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return { items };
}

/**
 * Parse a Wallhaven search JSON body.
 * @param {unknown} body
 * @param {string} sourceUrl
 * @returns {{ items: Array<object>, error?: string, nextPage?: number }}
 */
function parseWallhaven(body, sourceUrl) {
  if (!body || typeof body !== 'object' || !Array.isArray(/** @type {{ data?: unknown }} */ (body).data)) {
    return { items: [], error: catalogError(sourceUrl, '不是壁纸目录') };
  }
  const record = /** @type {{ data: unknown[], meta?: { current_page?: unknown, last_page?: unknown } }} */ (body);
  const items = [];
  for (const entry of record.data) {
    const mapped = wallhavenItem(entry);
    if (mapped) items.push(mapped);
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  const result = { items };
  const meta = record.meta && typeof record.meta === 'object' ? record.meta : {};
  const current = Number(meta.current_page);
  const last = Number(meta.last_page);
  if (Number.isFinite(current) && Number.isFinite(last) && current < last) {
    result.nextPage = current + 1;
  }
  return result;
}

/**
 * Read a response body and abort once it exceeds maxBytes.
 * @param {Response} response
 * @param {number} maxBytes
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function readLimitedBody(response, maxBytes, url) {
  const stream = response.body;
  if (!stream) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(catalogError(url, '过大'));
    }
    return buffer;
  }
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        throw new Error(catalogError(url, '过大'));
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader already closed after a complete or oversized body.
    }
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch a URL with hop-counted redirects. Each Location is re-checked.
 * @param {string} url
 * @param {{ maxBytes: number, timeoutMs: number }} limits
 * @param {number} [hops]
 * @returns {Promise<{ buffer: Buffer, contentType: string, finalUrl: string }>}
 */
async function fetchBuffer(url, { maxBytes, timeoutMs }, hops = 0) {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    throw new Error(catalogError(url, '地址无效'));
  }
  if (hops > MAX_REDIRECTS) {
    throw new Error(catalogError(url, '重定向过多'));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(parsed.href, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (response.body) {
        try {
          await response.body.cancel();
        } catch {
          // Response body already cancelled or closed after a 3xx.
        }
      }
      if (!location) {
        throw new Error(catalogError(url, '重定向无效'));
      }
      return fetchBuffer(resolveAgainst(location, parsed.href), { maxBytes, timeoutMs }, hops + 1);
    }
    if (!parseHttpUrl(response.url || parsed.href)) {
      throw new Error(catalogError(url, '重定向到了不允许的地址'));
    }
    const announced = Number(response.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > maxBytes) {
      throw new Error(catalogError(url, '过大'));
    }
    if (!response.ok) {
      throw new Error(catalogError(url, `请求失败（${response.status}）`));
    }
    const buffer = await readLimitedBody(response, maxBytes, url);
    return { buffer, contentType: response.headers.get('content-type') || '', finalUrl: response.url || parsed.href };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(catalogError(url, '超时'));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch JSON and parse it. Size and stream caps are the catalog 4MB limit.
 * @param {string} url
 * @param {(body: unknown, sourceUrl: string) => { items: Array<object>, error?: string, nextPage?: number }} parseBody
 * @returns {Promise<{ items: Array<object>, warning?: string, nextPage?: number }>}
 */
async function loadCatalog(url, parseBody) {
  if (!parseHttpUrl(typeof url === 'string' ? url : '')) {
    return { items: [], warning: catalogError(typeof url === 'string' ? url : '', '只接受 https 地址') };
  }
  try {
    const { buffer } = await fetchBuffer(url, {
      maxBytes: MAX_CATALOG_BYTES,
      timeoutMs: CATALOG_TIMEOUT_MS,
    });
    let body;
    try {
      body = JSON.parse(buffer.toString('utf8'));
    } catch {
      return { items: [], warning: catalogError(url, '不是 JSON') };
    }
    const parsed = parseBody(body, url);
    const result = { items: parsed.items };
    if (parsed.error) result.warning = parsed.error;
    if (parsed.nextPage !== undefined) result.nextPage = parsed.nextPage;
    return result;
  } catch (error) {
    return {
      items: [],
      warning: error instanceof Error ? error.message : catalogError(url, '读取失败'),
    };
  }
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

async function listBingToday() {
  const items = [];
  let warning = '';
  for (const source of bingCatalogUrls()) {
    const loaded = await loadCatalog(source, parseCatalogJson);
    for (const item of loaded.items) {
      items.push({ ...item, source: 'bing' });
    }
    if (loaded.warning) warning = joinWarning(warning, loaded.warning);
  }
  const result = { items: dedupeItems(items) };
  if (warning) result.warning = warning;
  return result;
}

async function listBingYear(year) {
  const loaded = await loadCatalog(bingArchiveUrl(year), parseBingArchive);
  const result = { items: dedupeItems(loaded.items) };
  if (loaded.warning) result.warning = loaded.warning;
  return result;
}

async function listWallhavenCatalog(query) {
  const loaded = await loadCatalog(wallhavenSearchUrl(query), parseWallhaven);
  const result = { items: dedupeItems(loaded.items) };
  if (loaded.warning) result.warning = loaded.warning;
  if (loaded.nextPage !== undefined) result.nextPage = loaded.nextPage;
  return result;
}

async function listCustomCatalog(url) {
  const loaded = await loadCatalog(typeof url === 'string' ? url : '', parseCatalogJson);
  const result = { items: dedupeItems(loaded.items) };
  if (loaded.warning) result.warning = loaded.warning;
  return result;
}

/**
 * List wallpapers for one gallery query.
 * @param {{
 *   kind?: 'bing' | 'wallhaven' | 'catalog',
 *   year?: number,
 *   url?: string,
 *   q?: string,
 *   categories?: string,
 *   page?: number,
 * }} [query]
 * @returns {Promise<{ items: Array<object>, warning?: string, nextPage?: number }>}
 */
async function listWallpaperCatalog(query = {}) {
  if (query.kind === 'bing') {
    return Number.isInteger(query.year) ? listBingYear(query.year) : listBingToday();
  }
  if (query.kind === 'wallhaven') {
    return listWallhavenCatalog(query);
  }
  if (query.kind === 'catalog') {
    return listCustomCatalog(query.url);
  }
  return { items: [] };
}

/**
 * Download a wallpaper image through the main process (avoids canvas CORS).
 * @param {string} url
 * @returns {Promise<{ dataUrl?: string, error?: string }>}
 */
async function downloadWallpaper(url) {
  if (!parseHttpUrl(url)) {
    return { error: '壁纸地址无效' };
  }
  try {
    const { buffer, contentType } = await fetchBuffer(url, {
      maxBytes: MAX_IMAGE_BYTES,
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mime)) {
      return { error: '壁纸不是可用的图片' };
    }
    const type = mime === 'image/jpg' ? 'image/jpeg' : mime;
    return { dataUrl: `data:${type};base64,${buffer.toString('base64')}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '下载壁纸失败' };
  }
}

module.exports = {
  MAX_CUSTOM_CATALOGS,
  MAX_ITEMS_PER_SOURCE,
  bingCatalogUrls,
  parseCatalogJson,
  listWallpaperCatalog,
  downloadWallpaper,
  isAllowedWallpaperUrl,
};
