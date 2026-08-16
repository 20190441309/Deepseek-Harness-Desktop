const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createWorkspaceAuthority,
  readHarnessRegisteredWorkspacePaths,
} = require('./workspace-authority');

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auth-'));
}

test('resolveAuthorizedCwd accepts the root and its subdirectories', () => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, 'sub'));
    const authority = createWorkspaceAuthority({ workspace: root });
    assert.equal(authority.resolveAuthorizedCwd(root), path.resolve(root));
    assert.equal(authority.resolveAuthorizedCwd(path.join(root, 'sub')), path.join(path.resolve(root), 'sub'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveAuthorizedCwd rejects paths outside, missing, and file targets', () => {
  const root = makeRoot();
  const outside = makeRoot();
  try {
    fs.writeFileSync(path.join(root, 'note.txt'), 'x');
    const authority = createWorkspaceAuthority({ workspace: root });
    assert.equal(authority.resolveAuthorizedCwd(outside), null);
    assert.equal(authority.resolveAuthorizedCwd(path.join(root, 'missing')), null);
    assert.equal(authority.resolveAuthorizedCwd(path.join(root, 'note.txt')), null);
    assert.equal(authority.resolveAuthorizedCwd(path.join(root, '..', path.basename(root), 'sub')), null);
    assert.equal(authority.resolveAuthorizedCwd(''), null);
    assert.equal(authority.resolveAuthorizedCwd(undefined), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('resolveInside refuses traversal and absolute targets', () => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const authority = createWorkspaceAuthority({ workspace: root });
    assert.equal(authority.resolveInside(root, 'src/a.ts'), path.join(path.resolve(root), 'src', 'a.ts'));
    assert.equal(authority.resolveInside(root, '..'), null);
    assert.equal(authority.resolveInside(root, path.join('..', 'outside.txt')), null);
    assert.equal(authority.resolveInside(root, path.resolve(os.tmpdir(), 'absolute.txt')), null);
    assert.equal(authority.resolveInside(root, ''), path.resolve(root));
    assert.equal(authority.resolveInside(path.join(root, '..'), 'x'), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** Best-effort directory link: junction on Windows (no privilege needed), dir symlink elsewhere. */
function makeDirLink(target, link) {
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(target, link, type);
}

test('resolveInside refuses a directory link that escapes the workspace', (t) => {
  const root = makeRoot();
  const outside = makeRoot();
  try {
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'classified\n');
    try {
      makeDirLink(outside, path.join(root, 'escape'));
    } catch (error) {
      t.skip(`directory links unavailable: ${error.code ?? error.message}`);
      return;
    }
    const authority = createWorkspaceAuthority({ workspace: root });
    assert.equal(authority.resolveInside(root, path.join('escape', 'secret.txt')), null);
    assert.equal(authority.resolveInside(root, path.join('escape', 'missing.txt')), null);
    assert.equal(authority.resolveAuthorizedCwd(path.join(root, 'escape')), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('resolveInside refuses a file link that escapes the workspace', (t) => {
  const root = makeRoot();
  const outside = makeRoot();
  try {
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'classified\n');
    try {
      fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'steal.txt'));
    } catch (error) {
      t.skip(`file links unavailable: ${error.code ?? error.message}`);
      return;
    }
    const authority = createWorkspaceAuthority({ workspace: root });
    assert.equal(authority.resolveInside(root, 'steal.txt'), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('resolveInside keeps directory links that stay inside the workspace', (t) => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, 'real'));
    fs.writeFileSync(path.join(root, 'real', 'a.ts'), 'x');
    try {
      makeDirLink(path.resolve(root, 'real'), path.join(root, 'link'));
    } catch (error) {
      t.skip(`directory links unavailable: ${error.code ?? error.message}`);
      return;
    }
    const authority = createWorkspaceAuthority({ workspace: root });
    assert.equal(
      authority.resolveInside(root, path.join('link', 'a.ts')),
      path.join(path.resolve(root), 'link', 'a.ts'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('empty workspace yields a null root that disables everything', () => {
  const authority = createWorkspaceAuthority({ workspace: '' });
  assert.equal(authority.authorizedRoot(), null);
  assert.equal(authority.resolveAuthorizedCwd(os.tmpdir()), null);
  assert.equal(authority.resolveInside(os.tmpdir(), 'x'), null);
});

test('resolveAuthorizedCwd accepts a second authorized root and rejects an outsider', () => {
  const boot = makeRoot();
  const extra = makeRoot();
  const outsider = makeRoot();
  try {
    fs.mkdirSync(path.join(extra, 'src'));
    const authority = createWorkspaceAuthority({
      workspace: boot,
      extraWorkspaces: [extra],
    });
    assert.equal(authority.resolveAuthorizedCwd(boot), path.resolve(boot));
    assert.equal(authority.resolveAuthorizedCwd(extra), path.resolve(extra));
    assert.equal(
      authority.resolveAuthorizedCwd(path.join(extra, 'src')),
      path.join(path.resolve(extra), 'src'),
    );
    assert.equal(authority.resolveAuthorizedCwd(outsider), null);
    assert.equal(authority.resolveInside(extra, 'src'), path.join(path.resolve(extra), 'src'));
    assert.equal(authority.resolveInside(extra, '..'), null);
    assert.equal(authority.resolveInside(outsider, 'src'), null);
    assert.deepEqual(authority.authorizedRoots(), [path.resolve(boot), path.resolve(extra)]);
  } finally {
    fs.rmSync(boot, { recursive: true, force: true });
    fs.rmSync(extra, { recursive: true, force: true });
    fs.rmSync(outsider, { recursive: true, force: true });
  }
});

test('listRegisteredWorkspaces is consulted on every resolve', () => {
  const boot = makeRoot();
  const extra = makeRoot();
  try {
    const listed = [];
    const authority = createWorkspaceAuthority({
      workspace: boot,
      listRegisteredWorkspaces: () => listed,
    });
    assert.equal(authority.resolveAuthorizedCwd(extra), null);
    listed.push(extra);
    assert.equal(authority.resolveAuthorizedCwd(extra), path.resolve(extra));
  } finally {
    fs.rmSync(boot, { recursive: true, force: true });
    fs.rmSync(extra, { recursive: true, force: true });
  }
});

test('resolveAuthorizedCwd accepts trailing separators and Windows drive-letter case', () => {
  const root = makeRoot();
  try {
    const authority = createWorkspaceAuthority({ workspace: root });
    const withSep = `${root}${path.sep}`;
    assert.equal(authority.resolveAuthorizedCwd(withSep), path.resolve(withSep));
    if (process.platform === 'win32' && /^[A-Za-z]:/.test(root)) {
      const flipped = root[0] === root[0].toUpperCase()
        ? root[0].toLowerCase() + root.slice(1)
        : root[0].toUpperCase() + root.slice(1);
      assert.notEqual(authority.resolveAuthorizedCwd(flipped), null);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readHarnessRegisteredWorkspacePaths reads workspace.json and ignores junk', () => {
  const home = makeRoot();
  const boot = makeRoot();
  const registered = makeRoot();
  const outsider = makeRoot();
  try {
    assert.deepEqual(readHarnessRegisteredWorkspacePaths(home), []);
    fs.mkdirSync(path.join(home, 'storages'));
    fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), '{not json', 'utf8');
    assert.deepEqual(readHarnessRegisteredWorkspacePaths(home), []);
    fs.writeFileSync(path.join(home, 'storages', 'workspace.json'), `${JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: ['ws-1'] },
      tables: {
        workspaces: {
          'ws-1': { path: registered, title: '测试' },
          'ws-2': { title: 'missing-path' },
          'ws-3': null,
        },
      },
    }, null, 2)}\n`, 'utf8');
    assert.deepEqual(readHarnessRegisteredWorkspacePaths(home), [registered]);
    const authority = createWorkspaceAuthority({
      workspace: boot,
      listRegisteredWorkspaces: () => readHarnessRegisteredWorkspacePaths(home),
    });
    assert.equal(authority.resolveAuthorizedCwd(registered), path.resolve(registered));
    assert.equal(authority.resolveAuthorizedCwd(outsider), null);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(boot, { recursive: true, force: true });
    fs.rmSync(registered, { recursive: true, force: true });
    fs.rmSync(outsider, { recursive: true, force: true });
  }
});
