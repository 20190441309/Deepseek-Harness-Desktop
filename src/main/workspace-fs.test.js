const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspaceAuthority } = require('./workspace-authority');
const { listDir, readFile, readFileMedia, setWorkspaceAuthority } = require('./workspace-fs.js');

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fs-'));
  // Pin the workspace authority so cwd checks pass inside this test root.
  setWorkspaceAuthority(createWorkspaceAuthority({ workspace: dir }));
  return dir;
}

test('listDir returns directories first and rejects path traversal', async () => {
  const cwd = makeTempDir();
  try {
    fs.mkdirSync(path.join(cwd, 'src'));
    fs.writeFileSync(path.join(cwd, 'README.md'), 'hello\n');
    const listed = await listDir(cwd, '');
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.entries, [
      { name: 'src', kind: 'directory' },
      { name: 'README.md', kind: 'file' },
    ]);
    const escaped = await listDir(cwd, '..');
    assert.equal(escaped.ok, false);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('readFile returns utf8 text and rejects a path outside cwd', async () => {
  const cwd = makeTempDir();
  try {
    fs.writeFileSync(path.join(cwd, 'note.txt'), 'alpha\n');
    const read = await readFile(cwd, 'note.txt');
    assert.equal(read.ok, true);
    assert.equal(read.binary, false);
    assert.equal(read.text, 'alpha\n');
    const escaped = await readFile(cwd, path.join('..', 'outside.txt'));
    assert.equal(escaped.ok, false);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('listDir accepts a second authorized root and rejects an outsider', async () => {
  const boot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fs-boot-'));
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fs-extra-'));
  const outsider = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fs-out-'));
  setWorkspaceAuthority(createWorkspaceAuthority({
    workspace: boot,
    extraWorkspaces: [extra],
  }));
  try {
    fs.writeFileSync(path.join(extra, 'README.md'), 'hello\n');
    fs.writeFileSync(path.join(outsider, 'secret.txt'), 'nope\n');
    const listed = await listDir(extra, '');
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.entries, [{ name: 'README.md', kind: 'file' }]);
    const blocked = await listDir(outsider, '');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.message, 'Path is outside the workspace.');
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(boot, { recursive: true, force: true });
    fs.rmSync(extra, { recursive: true, force: true });
    fs.rmSync(outsider, { recursive: true, force: true });
  }
});

test('readFileMedia returns png bytes and rejects non-images and traversal', async () => {
  const cwd = makeTempDir();
  try {
    fs.writeFileSync(path.join(cwd, 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(cwd, 'note.ts'), 'export {}\n');
    const png = await readFileMedia(cwd, 'icon.png');
    assert.equal(png.ok, true);
    assert.equal(png.mime, 'image/png');
    assert.equal(typeof png.base64, 'string');
    const ts = await readFileMedia(cwd, 'note.ts');
    assert.equal(ts.ok, false);
    const escaped = await readFileMedia(cwd, path.join('..', 'icon.png'));
    assert.equal(escaped.ok, false);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
