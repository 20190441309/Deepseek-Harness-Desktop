const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createWorkspaceAuthority } = require('./workspace-authority');
const { gitCommit, gitDiff, gitStatus, parseUnifiedDiff, run, setWorkspaceAuthority } = require('./git.js');

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-git-'));
  // Pin the workspace authority so cwd checks pass inside this test root.
  setWorkspaceAuthority(createWorkspaceAuthority({ workspace: dir }));
  return dir;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test('gitStatus returns null when the directory is not a git repository', async () => {
  const cwd = makeTempDir();
  try {
    assert.equal(await gitStatus(cwd), null);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('gitStatus reports hasWorkingTreeChanges after init and an uncommitted file', async () => {
  const cwd = makeTempDir();
  try {
    git(cwd, ['init']);
    git(cwd, ['config', 'user.email', 'git-test@example.com']);
    git(cwd, ['config', 'user.name', 'Git Test']);
    git(cwd, ['checkout', '-b', 'main']);
    fs.writeFileSync(path.join(cwd, 'README.md'), 'hello\n');
    const status = await gitStatus(cwd);
    assert.ok(status);
    assert.equal(status.hasWorkingTreeChanges, true);
    assert.equal(status.refName, 'main');
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('gitDiff returns null when the directory is not a git repository', async () => {
  const cwd = makeTempDir();
  try {
    assert.equal(await gitDiff(cwd), null);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('gitDiff lists a working-tree hunk after a committed file is edited', async () => {
  const cwd = makeTempDir();
  try {
    git(cwd, ['init']);
    git(cwd, ['config', 'user.email', 'git-test@example.com']);
    git(cwd, ['config', 'user.name', 'Git Test']);
    git(cwd, ['checkout', '-b', 'main']);
    fs.writeFileSync(path.join(cwd, 'README.md'), 'hello\n');
    git(cwd, ['add', 'README.md']);
    git(cwd, ['commit', '-m', 'Add readme']);
    fs.writeFileSync(path.join(cwd, 'README.md'), 'hello\nworld\n');
    const diff = await gitDiff(cwd);
    assert.ok(diff);
    const file = diff.files.find((entry) => entry.path === 'README.md');
    assert.ok(file);
    assert.equal(file.status, 'modified');
    assert.ok(file.hunks.some((hunk) => hunk.lines.some((line) => line.kind === 'add' && line.text === 'world')));
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('parseUnifiedDiff takes path from diff --git when +++ is absent', () => {
  const files = parseUnifiedDiff([
    'diff --git a/img.png b/img.png',
    'index 111..222 100644',
    'Binary files a/img.png and b/img.png differ',
    'diff --git a/icon.png b/icon.png',
    'index 333..444 100644',
    'Binary files a/icon.png and b/icon.png differ',
    'diff --git a/tool.sh b/tool.sh',
    'old mode 100644',
    'new mode 100755',
  ].join('\n'));
  assert.deepEqual(files.map((file) => file.path), ['img.png', 'icon.png', 'tool.sh']);
  assert.ok(files.every((file) => file.path !== ''));
});

test('gitDiff keeps a real path for a committed then modified binary', async () => {
  const cwd = makeTempDir();
  try {
    git(cwd, ['init']);
    git(cwd, ['config', 'user.email', 'git-test@example.com']);
    git(cwd, ['config', 'user.name', 'Git Test']);
    git(cwd, ['checkout', '-b', 'main']);
    fs.writeFileSync(path.join(cwd, 'img.bin'), Buffer.from([0, 1, 2, 3]));
    fs.writeFileSync(path.join(cwd, 'icon.bin'), Buffer.from([9, 8, 7]));
    git(cwd, ['add', 'img.bin', 'icon.bin']);
    git(cwd, ['commit', '-m', 'Add binaries']);
    fs.writeFileSync(path.join(cwd, 'img.bin'), Buffer.from([0, 1, 2, 4]));
    fs.writeFileSync(path.join(cwd, 'icon.bin'), Buffer.from([9, 8, 6]));
    const diff = await gitDiff(cwd);
    assert.ok(diff);
    const paths = diff.files.map((file) => file.path).sort();
    assert.deepEqual(paths, ['icon.bin', 'img.bin']);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('parseUnifiedDiff keeps +++ and --- hunk lines as content', () => {
  const files = parseUnifiedDiff([
    'diff --git a/foo.c b/foo.c',
    '--- a/foo.c',
    '+++ b/foo.c',
    '@@ -1,2 +1,2 @@',
    '- -- sql',
    '+ ++ op',
  ].join('\n'));
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'foo.c');
  assert.deepEqual(files[0].hunks[0].lines, [
    { kind: 'del', text: ' -- sql' },
    { kind: 'add', text: ' ++ op' },
  ]);
});

test('run kills a hung child after the timeout', async () => {
  const result = await run(
    process.execPath,
    ['-e', 'setTimeout(() => {}, 30000)'],
    os.tmpdir(),
    { timeoutMs: 80 },
  );
  assert.equal(result.timedOut, true);
  assert.equal(result.code, -1);
});

test('run caps stdout and sets truncated', async () => {
  const result = await run(
    process.execPath,
    ['-e', "process.stdout.write('x'.repeat(64))"],
    os.tmpdir(),
    { maxBytes: 8 },
  );
  assert.equal(result.truncated, true);
  assert.ok(result.stdout.length <= 8);
});

test('gitCommit records a message and clears working-tree changes', async () => {
  const cwd = makeTempDir();
  try {
    git(cwd, ['init']);
    git(cwd, ['config', 'user.email', 'git-test@example.com']);
    git(cwd, ['config', 'user.name', 'Git Test']);
    git(cwd, ['checkout', '-b', 'main']);
    fs.writeFileSync(path.join(cwd, 'README.md'), 'hello\n');
    const result = await gitCommit(cwd, 'Add readme');
    assert.equal(result.ok, true);
    const status = await gitStatus(cwd);
    assert.ok(status);
    assert.equal(status.hasWorkingTreeChanges, false);
    assert.equal(status.refName, 'main');
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
