const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const { app, shell } = require('electron');

const GITHUB_OWNER = 'ChisaAlter';
const GITHUB_REPO = 'Deepseek-Harness-Desktop';
const RELEASES_LATEST = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

function currentVersion() {
  try {
    return app.getVersion();
  } catch {
    return '0.0.0';
  }
}

function githubHeaders(accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    'User-Agent': `Deepseek-Harness-Desktop/${currentVersion()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/)[0];
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const delta = (a[i] || 0) - (b[i] || 0);
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }
  return 0;
}

function pickInstaller(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const exes = list.filter((asset) => typeof asset?.name === 'string'
    && /\.exe$/i.test(asset.name)
    && !/\.blockmap$/i.test(asset.name)
    && typeof asset.browser_download_url === 'string');
  return exes.find((asset) => /setup|nsis|installer/i.test(asset.name))
    || exes.find((asset) => !/portable/i.test(asset.name))
    || exes[0]
    || null;
}

async function githubJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`);
  }
  return response.json();
}

function snapshot(extra = {}) {
  return {
    current: currentVersion(),
    repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    repoUrl: REPO_URL,
    releasesUrl: RELEASES_PAGE,
    ...extra,
  };
}

async function checkUpdate() {
  try {
    const release = await githubJson(RELEASES_LATEST);
    if (!release) {
      return snapshot({
        status: 'none',
        latest: '',
        htmlUrl: RELEASES_PAGE,
        assetName: '',
        assetUrl: '',
      });
    }
    const latest = normalizeVersion(release.tag_name || release.name);
    const asset = pickInstaller(release.assets);
    const newer = latest && compareVersions(latest, currentVersion()) > 0;
    return snapshot({
      status: newer ? 'available' : 'current',
      latest,
      tag: release.tag_name || latest,
      htmlUrl: release.html_url || RELEASES_PAGE,
      notes: typeof release.body === 'string' ? release.body : '',
      assetName: asset?.name || '',
      assetUrl: asset?.browser_download_url || '',
    });
  } catch (error) {
    return snapshot({
      status: 'error',
      latest: '',
      htmlUrl: RELEASES_PAGE,
      assetName: '',
      assetUrl: '',
      message: error.message || String(error),
    });
  }
}

function downloadHeaders(firstHop) {
  const headers = {
    'User-Agent': `Deepseek-Harness-Desktop/${currentVersion()}`,
  };
  if (firstHop) {
    headers.Accept = 'application/octet-stream';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }
  return headers;
}

function cleanupPartial(dest) {
  try {
    fs.unlinkSync(dest);
  } catch {
    // ignore missing partials
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let settled = false;
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      file.close(() => cleanupPartial(dest));
      reject(error);
    };
    const visit = (target, hops) => {
      if (hops > 8) {
        fail(new Error('Too many redirects'));
        return;
      }
      const request = https.get(target, {
        headers: downloadHeaders(hops === 0),
      }, (response) => {
        const location = response.headers.location;
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
          response.resume();
          visit(location, hops + 1);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          fail(new Error(`Download ${response.statusCode}`));
          return;
        }
        const total = Number(response.headers['content-length']) || 0;
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0 && typeof onProgress === 'function') {
            onProgress({
              phase: 'download',
              percent: Math.min(99, Math.round((received / total) * 100)),
            });
          }
        });
        response.pipe(file);
        file.on('finish', () => {
          if (settled) {
            return;
          }
          settled = true;
          file.close(() => resolve(dest));
        });
      });
      request.on('error', fail);
    };
    file.on('error', fail);
    visit(url, 0);
  });
}

function launchInstaller(file) {
  const child = spawn(file, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

async function installUpdate(onProgress) {
  const info = await checkUpdate();
  if (info.status === 'error') {
    return { ...info, launched: false, openedPage: false };
  }
  if (!info.assetUrl) {
    if (info.htmlUrl) {
      await shell.openExternal(info.htmlUrl);
    }
    return { ...info, launched: false, openedPage: Boolean(info.htmlUrl) };
  }
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'download', percent: 0 });
  }
  const dir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(dir, { recursive: true });
  const safeName = path.basename(info.assetName || 'DeepSeek-Harness-Setup.exe').replace(/[^\w.\-]+/g, '_');
  const dest = path.join(dir, safeName);
  await downloadFile(info.assetUrl, dest, onProgress);
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'install', percent: 100 });
  }
  launchInstaller(dest);
  if (app.isPackaged) {
    setTimeout(() => app.quit(), 800);
  }
  return { ...info, launched: true, installer: dest };
}

module.exports = {
  GITHUB_OWNER,
  GITHUB_REPO,
  REPO_URL,
  RELEASES_PAGE,
  currentVersion,
  checkUpdate,
  installUpdate,
};
