const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createWorkspaceAuthority } = require('./workspace-authority');
const { gitBranchList, gitCommit, gitCreateBranch, gitDiff, gitDiscard, gitInit, gitStage, gitStatus, gitStatusEntries, gitSwitchBranch, gitUnstage, parsePorcelainZ, parseUnifiedDiff, run, setWorkspaceAuthority } = require('./git.js');

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

test('gitStatus reports isRepo false when the directory is not a git repository', async () => {
  const cwd = makeTempDir();
  try {
    const status = await gitStatus(cwd);
    assert.equal(status.isRepo, false);
    assert.equal(status.refName, null);
    assert.equal(status.hasWorkingTreeChanges, false);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('gitInit creates a repository the titlebar can commit into', async () => {
  const cwd = makeTempDir();
  try {
    const inited = await gitInit(cwd);
    assert.equal(inited.ok, true);
    const again = await gitInit(cwd);
    assert.equal(again.ok, true);
    const status = await gitStatus(cwd);
    assert.equal(status.isRepo, true);
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
    assert.equal(status.isRepo, true);
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

test('run joins stdout chunks split mid-multibyte without replacement characters', async () => {
  const result = await run(
    process.execPath,
    ['-e', "process.stdout.write('深'); setTimeout(() => { process.stdout.write('询\\n') }, 20)"],
    os.tmpdir(),
    { timeoutMs: 10_000 },
  );
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '深询\n');
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

test('parsePorcelainZ skips rename origin fields', () => {
  const entries = parsePorcelainZ('R  old.txt\0new.txt\0 M src/a.ts\0?? extra.md\0');
  assert.deepEqual(entries, [
    { path: 'new.txt', xy: 'R ' },
    { path: 'src/a.ts', xy: ' M' },
    { path: 'extra.md', xy: '??' },
  ]);
});

test('gitStatus accepts a second authorized git root and ignores an outsider repo', async () => {
  const boot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-git-boot-'));
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-git-extra-'));
  const outsider = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-git-out-'));
  setWorkspaceAuthority(createWorkspaceAuthority({
    workspace: boot,
    extraWorkspaces: [extra],
  }));
  try {
    git(extra, ['init']);
    git(extra, ['config', 'user.email', 'git-test@example.com']);
    git(extra, ['config', 'user.name', 'Git Test']);
    git(extra, ['checkout', '-b', 'main']);
    git(outsider, ['init']);
    const status = await gitStatus(extra);
    assert.ok(status);
    assert.equal(status.refName, 'main');
    assert.equal(await gitStatus(outsider), null);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(boot, { recursive: true, force: true });
    fs.rmSync(extra, { recursive: true, force: true });
    fs.rmSync(outsider, { recursive: true, force: true });
  }
});

test('gitStage rejects a path outside the workspace', async () => {
  const cwd = makeTempDir();
  try {
    git(cwd, ['init']);
    const escaped = await gitStage(cwd, path.join('..', 'outside.txt'));
    assert.equal(escaped.ok, false);
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('gitStage, gitUnstage, and gitDiscard operate on a tracked file', async () => {
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
    const staged = await gitStage(cwd, 'README.md');
    assert.equal(staged.ok, true);
    const entries = await gitStatusEntries(cwd);
    assert.equal(entries.ok, true);
    const row = entries.entries.find((item) => item.path === 'README.md');
    assert.ok(row);
    assert.equal(row.xy[0], 'M');
    const unstaged = await gitUnstage(cwd, 'README.md');
    assert.equal(unstaged.ok, true);
    const discarded = await gitDiscard(cwd, 'README.md');
    assert.equal(discarded.ok, true);
    assert.equal(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'hello\n');
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('gitBranchList marks the current branch and gitSwitchBranch/gitCreateBranch round-trip', async () => {
  const cwd = makeTempDir();
  try {
    git(cwd, ['init', '-b', 'main']);
    git(cwd, ['config', 'user.email', 't@local']);
    git(cwd, ['config', 'user.name', 'T']);
    fs.writeFileSync(path.join(cwd, 'README.md'), 'x\n');
    git(cwd, ['add', 'README.md']);
    git(cwd, ['commit', '-m', 'base']);

    const listed = await gitBranchList(cwd);
    assert.equal(listed.ok, true);
    assert.equal(listed.branches.length, 1);
    assert.equal(listed.branches[0].name, 'main');
    assert.equal(listed.branches[0].isCurrent, true);
    assert.equal(listed.branches[0].isRemote, false);

    const created = await gitCreateBranch(cwd, 'feature/qa');
    assert.equal(created.ok, true, created.message);
    assert.equal(created.refName, 'feature/qa');

    const back = await gitSwitchBranch(cwd, 'main');
    assert.equal(back.ok, true, back.message);
    assert.equal(back.refName, 'main');
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('gitSwitchBranch and gitCreateBranch reject unsafe ref names', async () => {
  const cwd = makeTempDir();
  try {
    git(cwd, ['init', '-b', 'main']);
    for (const bad of ['../evil', '-b', 'x..y', 'a/.lock', '']) {
      const switched = await gitSwitchBranch(cwd, bad);
      assert.equal(switched.ok, false, bad);
      const created = await gitCreateBranch(cwd, bad);
      assert.equal(created.ok, false, bad);
    }
  } finally {
    setWorkspaceAuthority(null);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
