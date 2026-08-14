const fs = require('node:fs');
const path = require('node:path');

const MAX_READ_BYTES = 512 * 1024;

function asCwd(cwd) {
  if (typeof cwd !== 'string' || cwd.trim() === '') return null;
  try {
    if (!fs.statSync(cwd).isDirectory()) return null;
  } catch {
    return null;
  }
  return path.resolve(cwd);
}

function resolveInside(cwd, relativePath) {
  const root = asCwd(cwd);
  if (!root) return null;
  const rel = typeof relativePath === 'string' ? relativePath : '';
  const target = path.resolve(root, rel);
  const fromRoot = path.relative(root, target);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return null;
  return target;
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

module.exports = {
  listDir,
  readFile,
};
