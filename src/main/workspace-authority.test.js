const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createWorkspaceAuthority,
  loadWorkspaceAuthority,
  readHarnessRegisteredWorkspacePaths,
  scratchWorkspacePath,
} = require('./workspace-authority');

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auth-'));
}

/** Production authority returns realpath, so macOS `/var` fixtures must compare against `/private/var`. */
function canonical(p) {
  return fs.realpathSync(path.resolve(p));
}

test('resolveAuthorizedCwd accepts the root and its subdirectories', () => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, 'sub'));
    const authority = createWorkspaceAuthority({ workspace: root });
    assert.equal(authority.resolveAuthorizedCwd(root), canonical(root));
    assert.equal(authority.resolveAuthorizedCwd(path.join(root, 'sub')), path.join(canonical(root), 'sub'));
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
    assert.equal(authority.resolveInside(root, 'src/a.ts'), path.join(canonical(root), 'src', 'a.ts'));
    assert.equal(authority.resolveInside(root, '..'), null);
    assert.equal(authority.resolveInside(root, path.join('..', 'outside.txt')), null);
    assert.equal(authority.resolveInside(root, path.resolve(os.tmpdir(), 'absolute.txt')), null);
    assert.equal(authority.resolveInside(root, ''), canonical(root));
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
      path.join(canonical(root), 'link', 'a.ts'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveAuthorizedCwd accepts a workspace configured through a directory link', (t) => {
  // Regression for macOS CI: roots used to be kept lexical while candidates
  // were realpath'd, so a /var -> /private/var prefix (or any linked root)
  // made every temp-dir workspace resolve to null.
  const root = makeRoot();
  const link = path.join(os.tmpdir(), `dsh-auth-root-link-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(path.join(root, 'sub'));
    try {
      makeDirLink(root, link);
    } catch (error) {
      t.skip(`directory links unavailable: ${error.code ?? error.message}`);
      return;
    }
    const authority = createWorkspaceAuthority({ workspace: link });
    assert.equal(authority.resolveAuthorizedCwd(link), fs.realpathSync(root));
    assert.equal(
      authority.resolveAuthorizedCwd(path.join(root, 'sub')),
      fs.realpathSync(path.join(root, 'sub')),
    );
  } finally {
    fs.rmSync(link, { force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('empty workspace yields a null root that disables everything', () => {
  const authority = createWorkspaceAuthority({ workspace: '' });
  assert.equal(authority.authorizedRoot(), null);
  assert.equal(authority.resolveAuthorizedCwd(os.tmpdir()), null);
  assert.equal(authority.resolveInside(os.tmpdir(), 'x'), null);
});

test('PTY authority can include the Host-owned no-workspace scratch cwd', () => {
  const home = makeRoot();
  const boot = makeRoot();
  const previousConfig = require.cache[require.resolve('./config')];
  const previousHome = process.env.DSH_HOME;
  try {
    const scratch = scratchWorkspacePath(home);
    fs.mkdirSync(scratch);
    require.cache[require.resolve('./config')] = {
      id: require.resolve('./config'),
      filename: require.resolve('./config'),
      loaded: true,
      exports: { loadConfig: () => ({ workspace: boot }) },
    };
    process.env.DSH_HOME = home;

    const ptyAuthority = loadWorkspaceAuthority({ allowScratchCwd: true });
    assert.equal(ptyAuthority.resolveAuthorizedCwd(scratch), canonical(scratch));
    const strictAuthority = loadWorkspaceAuthority();
    assert.equal(strictAuthority.resolveAuthorizedCwd(scratch), null);
  } finally {
    if (previousConfig) require.cache[require.resolve('./config')] = previousConfig;
    else delete require.cache[require.resolve('./config')];
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(boot, { recursive: true, force: true });
  }
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
    assert.equal(authority.resolveAuthorizedCwd(boot), canonical(boot));
    assert.equal(authority.resolveAuthorizedCwd(extra), canonical(extra));
    assert.equal(
      authority.resolveAuthorizedCwd(path.join(extra, 'src')),
      path.join(canonical(extra), 'src'),
    );
    assert.equal(authority.resolveAuthorizedCwd(outsider), null);
    assert.equal(authority.resolveInside(extra, 'src'), path.join(canonical(extra), 'src'));
    assert.equal(authority.resolveInside(extra, '..'), null);
    assert.equal(authority.resolveInside(outsider, 'src'), null);
    assert.deepEqual(authority.authorizedRoots(), [canonical(boot), canonical(extra)]);
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
    assert.equal(authority.resolveAuthorizedCwd(extra), canonical(extra));
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
    assert.equal(authority.resolveAuthorizedCwd(withSep), canonical(withSep));
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
    assert.equal(authority.resolveAuthorizedCwd(registered), canonical(registered));
    assert.equal(authority.resolveAuthorizedCwd(outsider), null);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(boot, { recursive: true, force: true });
    fs.rmSync(registered, { recursive: true, force: true });
    fs.rmSync(outsider, { recursive: true, force: true });
  }
});
