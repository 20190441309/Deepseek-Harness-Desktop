const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspaceAuthority } = require('./workspace-authority');
const { listDir, readFile, setWorkspaceAuthority } = require('./workspace-fs.js');

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
