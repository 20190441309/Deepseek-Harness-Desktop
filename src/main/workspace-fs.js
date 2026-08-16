const fs = require('node:fs');
const path = require('node:path');
const { loadWorkspaceAuthority } = require('./workspace-authority');

const MAX_READ_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 512 * 1024;

const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

let workspaceAuthority = null;

/** Test seam: pin the trust root (node:test runs outside Electron). */
function setWorkspaceAuthority(authority) {
  workspaceAuthority = authority;
}

function authority() {
  if (workspaceAuthority === null) workspaceAuthority = loadWorkspaceAuthority();
  return workspaceAuthority;
}

function asCwd(cwd) {
  return authority().resolveAuthorizedCwd(cwd);
}

function resolveInside(cwd, relativePath) {
  return authority().resolveInside(cwd, relativePath);
}

function fail(message) {
  return { ok: false, message };
}

async function listDir(cwd, relativePath) {
  const target = resolveInside(cwd, relativePath);
  if (!target) return fail('Path is outside the workspace.');
  let names;
  try {
    names = await fs.promises.readdir(target, { withFileTypes: true });
  } catch (error) {
    return fail(error.message || 'Could not list directory.');
  }
  const entries = names.map((entry) => ({
    name: entry.name,
    kind: entry.isDirectory() ? 'directory' : 'file',
  }));
  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  return { ok: true, entries };
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

async function readFile(cwd, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    return fail('File path is required.');
  }
  const target = resolveInside(cwd, relativePath);
  if (!target) return fail('Path is outside the workspace.');
  let stat;
  try {
    stat = await fs.promises.stat(target);
  } catch (error) {
    return fail(error.message || 'Could not read file.');
  }
  if (!stat.isFile()) return fail('Not a file.');
  const truncated = stat.size > MAX_READ_BYTES;
  let buf;
  try {
    if (truncated) {
      const handle = await fs.promises.open(target, 'r');
      try {
        const slice = Buffer.alloc(MAX_READ_BYTES);
        const { bytesRead } = await handle.read(slice, 0, MAX_READ_BYTES, 0);
        buf = slice.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } else {
      buf = await fs.promises.readFile(target);
    }
  } catch (error) {
    return fail(error.message || 'Could not read file.');
  }
  if (looksBinary(buf)) {
    return { ok: true, binary: true, text: '', truncated };
  }
  return { ok: true, binary: false, text: buf.toString('utf8'), truncated };
}

async function readFileMedia(cwd, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    return fail('File path is required.');
  }
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) return fail('Not an image file.');
  const target = resolveInside(cwd, relativePath);
  if (!target) return fail('Path is outside the workspace.');
  let stat;
  try {
    stat = await fs.promises.stat(target);
  } catch (error) {
    return fail(error.message || 'Could not read file.');
  }
  if (!stat.isFile()) return fail('Not a file.');
  const truncated = stat.size > MAX_READ_BYTES;
  let buf;
  try {
    if (truncated) {
      const handle = await fs.promises.open(target, 'r');
      try {
        const slice = Buffer.alloc(MAX_READ_BYTES);
        const { bytesRead } = await handle.read(slice, 0, MAX_READ_BYTES, 0);
        buf = slice.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } else {
      buf = await fs.promises.readFile(target);
    }
  } catch (error) {
    return fail(error.message || 'Could not read file.');
  }
  return { ok: true, mime, base64: buf.toString('base64'), truncated };
}

async function writeFile(cwd, relativePath, text) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    return fail('File path is required.');
  }
  if (typeof text !== 'string') return fail('File text is required.');
  if (Buffer.byteLength(text, 'utf8') > MAX_WRITE_BYTES) {
    return fail('File is too large to save from this panel.');
  }
  const target = resolveInside(cwd, relativePath);
  if (!target) return fail('Path is outside the workspace.');
  let stat;
  try {
    stat = await fs.promises.stat(target);
  } catch (error) {
    return fail(error.message || 'Could not write file.');
  }
  if (!stat.isFile()) return fail('Not a file.');
  try {
    await fs.promises.writeFile(target, text, 'utf8');
  } catch (error) {
    return fail(error.message || 'Could not write file.');
  }
  return { ok: true };
}

module.exports = {
  listDir,
  readFile,
  readFileMedia,
  writeFile,
  setWorkspaceAuthority,
  MAX_WRITE_BYTES,
};

