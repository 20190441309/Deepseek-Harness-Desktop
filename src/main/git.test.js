const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gitCommit, gitStatus } = require('./git.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-git-'));
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
    fs.rmSync(cwd, { recursive: true, force: true });
  }
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
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
