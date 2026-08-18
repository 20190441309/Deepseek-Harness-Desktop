const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-marketplace-install-'));
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      isPackaged: false,
      getPath() {
        return userData;
      },
    },
  },
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('network disabled in marketplace-install tests');
};

const { parseAllowBuilds } = require('./marketplace-allowbuilds');
const {
  installPlugin,
  uninstallPlugin,
  installMarketplacePlugin,
} = require('./marketplace-install');

const NPM_ID = '13071301808/dsh-composer-expand';
const GITHUB_ID = '01Virex/dsh-status-rotator';
const PATH_ID = 'DamonKoy/dsh-web-ui#dsh-aionui-panel';
const DROPPED_ID = 'omdsh-dev/dsh-genui';
const NPM_SPEC = 'dsh-composer-expand';
const GITHUB_SPEC = 'github:01Virex/dsh-status-rotator';
const PATH_SPEC = 'github:DamonKoy/dsh-web-ui#path:/packages/dsh-aionui-panel';

let dshHomeDir = '';

function cacheFile() {
  return path.join(userData, 'marketplace-cache.json');
}

function profileDir() {
  return path.join(dshHomeDir, 'profiles', 'web');
}

function writeProfileDep(packageName, spec) {
  const dir = profileDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: 'web',
    dependencies: { [packageName]: spec },
  }, null, 2)}\n`);
}

function writePlugin(packageName, manifest, files = {}) {
  const dir = path.join(profileDir(), 'node_modules', packageName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: packageName,
    ...manifest,
  }, null, 2)}\n`);
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
}

function writeBundlePlugin(packageName) {
  const id = `bundle-${String(packageName).replace(/[^A-Za-z0-9]+/g, '-')}`.slice(0, 48);
  writePlugin(packageName, {
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, {
    'cordis.patch.yml': `- insert:\n    - id: ${id}\n      name: ${packageName}\n`,
  });
}

function writeClientPlugin(packageName) {
  writePlugin(packageName, {
    dsh: { client: { platform: 'web', inject: [] } },
    exports: { './client': { default: './lib/client.js' } },
  }, { 'lib/client.js': 'export {}\n' });
}

function writeExportsPlugin(packageName) {
  writePlugin(packageName, {
    exports: { '.': { default: './lib/index.js' } },
  }, { 'lib/index.js': 'module.exports = {}\n' });
}

function writeBarePlugin(packageName) {
  writePlugin(packageName, {});
}

function writeDiskRegistry(plugins) {
  fs.writeFileSync(cacheFile(), `${JSON.stringify({
    version: 3,
    fetchedAt: Date.now(),
    registry: { plugins },
  }, null, 2)}\n`);
}

function githubRow(owner, name, url, installToken) {
  return {
    owner,
    name,
    url,
    category: 'ui',
    description: { en: name, zh: name },
    npm: null,
    stars: 0,
    install: `dsh plugin --profile web add ${installToken}`,
    added: '2026-08-18',
  };
}

function recordRunner(onAdd) {
  const calls = [];
  return {
    calls,
    runPlugin: async (args) => {
      calls.push(args.slice());
      if (args[0] === 'add' && typeof onAdd === 'function') {
        onAdd(args[1]);
      }
      return { ok: true, code: 0, log: '', needsAllowBuilds: false, allowBuilds: [] };
    },
  };
}

test.beforeEach(() => {
  dshHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  process.env.DSH_HOME = dshHomeDir;
});

test.afterEach(() => {
  delete process.env.DSH_HOME;
  fs.rmSync(dshHomeDir, { recursive: true, force: true });
  try {
    fs.unlinkSync(cacheFile());
  } catch {
    // no cache this test
  }
});

test.after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(userData, { recursive: true, force: true });
});

test('parseAllowBuilds reads ignored build script names', () => {
  const keys = parseAllowBuilds(`
pnpm: git-hosted plugins build on install
Ignored build scripts: @dsh-external/dsh-loop@0.1.0 foo-bar@2.0.0
Run "pnpm approve-builds" to pick which dependencies should be allowed
`);
  assert.ok(keys.includes('@dsh-external/dsh-loop'));
  assert.ok(keys.includes('foo-bar'));
});

test('parseAllowBuilds reads yaml-style allowBuilds keys', () => {
  const keys = parseAllowBuilds(`
add the exact key under allowBuilds:
  "github.com/owner/repo": false
`);
  assert.ok(keys.includes('github.com/owner/repo'));
});

test('parseAllowBuilds drops path and yaml-like keys', () => {
  const keys = parseAllowBuilds(`
  "../prepare": false
  "good-package": false
  "bad:key": false
`);
  assert.deepEqual(keys, ['good-package']);
});

test('installPlugin rejects non-github specs before invoking the CLI', async () => {
  const result = await installPlugin('file:../local-plugin', { allowBuilds: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /github:owner\/repo/);
});

test('installPlugin rejects a catalog #path: spec before invoking the CLI', async () => {
  const { calls, runPlugin } = recordRunner();
  const result = await installPlugin(PATH_SPEC, { allowBuilds: [], runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /github:owner\/repo/);
  assert.equal(calls.length, 0);
});

test('installPlugin rejects invalid allowBuilds before invoking the CLI', async () => {
  const result = await installPlugin('github:owner/repo', { allowBuilds: ['../prepare'] });
  assert.equal(result.ok, false);
  assert.match(result.error, /allowBuilds/);
});

test('uninstallPlugin rejects shell syntax before invoking the CLI', async () => {
  const result = await uninstallPlugin('safe-package & calc.exe');
  assert.equal(result.ok, false);
  assert.match(result.error, /包名/);
});

test('installMarketplacePlugin rejects an unknown catalog id before invoking the CLI', async () => {
  const { calls, runPlugin } = recordRunner();
  const result = await installMarketplacePlugin('missing/plugin', { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /未收录/);
  assert.equal(calls.length, 0);
});

test('installMarketplacePlugin rejects a DROPPED catalog plugin before invoking the CLI', async () => {
  const { calls, runPlugin } = recordRunner();
  const result = await installMarketplacePlugin(DROPPED_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /退役|下架|不再/);
  assert.equal(calls.length, 0);
});

test('installMarketplacePlugin rejects invalid allowBuilds before invoking the CLI', async () => {
  const { calls, runPlugin } = recordRunner();
  const result = await installMarketplacePlugin(NPM_ID, { allowBuilds: ['../prepare'], runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /allowBuilds/);
  assert.equal(calls.length, 0);
});

test('installMarketplacePlugin installs a curated npm spec through the plugin runner', async () => {
  const { calls, runPlugin } = recordRunner(() => {
    writeBundlePlugin(NPM_SPEC);
  });
  const result = await installMarketplacePlugin(NPM_ID, { runPlugin });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['add', NPM_SPEC]]);
  assert.equal(result.spec, NPM_SPEC);
});

test('installMarketplacePlugin installs github:owner/repo through the plugin runner', async () => {
  const { calls, runPlugin } = recordRunner(() => {
    writeProfileDep('@virex/dsh-status-rotator', 'git+https://github.com/01Virex/dsh-status-rotator.git');
    writeClientPlugin('@virex/dsh-status-rotator');
  });
  const result = await installMarketplacePlugin(GITHUB_ID, { runPlugin });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['add', GITHUB_SPEC]]);
});

test('installMarketplacePlugin allows a catalog #path: spec that Host installPlugin rejects', async () => {
  const { calls, runPlugin } = recordRunner(() => {
    writeProfileDep(
      'dsh-aionui-panel',
      'git+https://github.com/DamonKoy/dsh-web-ui.git#path:/packages/dsh-aionui-panel',
    );
    writeExportsPlugin('dsh-aionui-panel');
  });
  const result = await installMarketplacePlugin(PATH_ID, { runPlugin });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['add', PATH_SPEC]]);
});

test('installMarketplacePlugin rejects #path: specs with .. or backslash', async () => {
  writeDiskRegistry([
    githubRow(
      'evil',
      'dotdot',
      'https://github.com/evil/dotdot/blob/main/README.md',
      'github:evil/dotdot#path:/packages/../../../tmp',
    ),
    githubRow(
      'evil',
      'backslash',
      'https://github.com/evil/backslash/blob/main/README.md',
      'github:evil/backslash#path:/packages\\windows',
    ),
  ]);
  const { calls, runPlugin } = recordRunner();
  const dotdot = await installMarketplacePlugin('evil/dotdot', { runPlugin });
  const backslash = await installMarketplacePlugin('evil/backslash', { runPlugin });
  assert.equal(dotdot.ok, false);
  assert.equal(backslash.ok, false);
  assert.doesNotMatch(dotdot.error, /未收录/);
  assert.doesNotMatch(backslash.error, /未收录/);
  assert.equal(calls.length, 0);
});

test('installMarketplacePlugin and uninstallPlugin share an in-flight mutex', async () => {
  let releaseAdd;
  let addStarted;
  const started = new Promise((resolve) => {
    addStarted = resolve;
  });
  const first = installMarketplacePlugin(NPM_ID, {
    runPlugin: () => {
      addStarted();
      return new Promise((resolve) => {
        releaseAdd = resolve;
      });
    },
  });
  await started;
  const uninstallCalls = [];
  const busyUninstall = await uninstallPlugin(NPM_SPEC, {
    runPlugin: async (args) => {
      uninstallCalls.push(args.slice());
      return { ok: true, code: 0, log: '', needsAllowBuilds: false, allowBuilds: [] };
    },
  });
  const busyInstall = await installPlugin(GITHUB_SPEC, {
    runPlugin: async () => {
      throw new Error('installPlugin should not run while marketplace install is in flight');
    },
  });
  assert.equal(busyUninstall.ok, false);
  assert.equal(busyUninstall.error, '已有插件正在安装或卸载，请稍后再试');
  assert.equal(busyInstall.ok, false);
  assert.equal(busyInstall.error, '已有插件正在安装或卸载，请稍后再试');
  assert.equal(uninstallCalls.length, 0);
  releaseAdd({ ok: false, code: 1, log: '', needsAllowBuilds: false, allowBuilds: [] });
  const firstResult = await first;
  assert.equal(firstResult.ok, false);
});

test('installMarketplacePlugin removes a package with no loadable dsh entry', async () => {
  const { calls, runPlugin } = recordRunner();
  const result = await installMarketplacePlugin(NPM_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /可加载/);
  assert.deepEqual(calls, [['add', NPM_SPEC], ['remove', NPM_SPEC]]);
});

test('installMarketplacePlugin removes a github package with no loadable dsh entry', async () => {
  const { calls, runPlugin } = recordRunner(() => {
    writeProfileDep('@virex/dsh-status-rotator', 'git+https://github.com/01Virex/dsh-status-rotator.git');
    writeBarePlugin('@virex/dsh-status-rotator');
  });
  const result = await installMarketplacePlugin(GITHUB_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /可加载/);
  assert.deepEqual(calls, [['add', GITHUB_SPEC], ['remove', '@virex/dsh-status-rotator']]);
});

test('installMarketplacePlugin removes a #path: package with no loadable dsh entry', async () => {
  const { calls, runPlugin } = recordRunner(() => {
    writeProfileDep(
      'dsh-aionui-panel',
      'git+https://github.com/DamonKoy/dsh-web-ui.git#path:/packages/dsh-aionui-panel',
    );
    writeBarePlugin('dsh-aionui-panel');
  });
  const result = await installMarketplacePlugin(PATH_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /可加载/);
  assert.deepEqual(calls, [['add', PATH_SPEC], ['remove', 'dsh-aionui-panel']]);
});

test('installMarketplacePlugin installs a GitHub URL when the install command is a tarball', async () => {
  writeDiskRegistry([githubRow(
    'HUITianYi',
    'dsh-whale-desktop-launcher',
    'https://github.com/HUITianYi/dsh-whale-desktop-launcher',
    '"https://github.com/HUITianYi/dsh-whale-desktop-launcher/releases/latest/download/x.tgz"',
  )]);
  const { calls, runPlugin } = recordRunner(() => {
    writeProfileDep('dsh-whale-desktop-launcher', 'github:HUITianYi/dsh-whale-desktop-launcher');
    writeClientPlugin('dsh-whale-desktop-launcher');
  });
  const result = await installMarketplacePlugin('HUITianYi/dsh-whale-desktop-launcher', { runPlugin });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['add', 'github:HUITianYi/dsh-whale-desktop-launcher']]);
  assert.equal(result.spec.includes('.tgz'), false);
});

test('installMarketplacePlugin rejects a github spec whose owner/repo does not match the catalog URL', async () => {
  writeDiskRegistry([githubRow(
    'evil',
    'mismatch',
    'https://example.com/not-github',
    'github:evil/mismatch',
  )]);
  const { calls, runPlugin } = recordRunner();
  const result = await installMarketplacePlugin('evil/mismatch', { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /不受支持/);
  assert.equal(calls.length, 0);
});

test('installMarketplacePlugin rejects a #path: spec that contains a colon', async () => {
  writeDiskRegistry([githubRow(
    'evil',
    'colon',
    'https://github.com/evil/colon/blob/main/README.md',
    'github:evil/colon#path:/packages:foo',
  )]);
  const { calls, runPlugin } = recordRunner();
  const result = await installMarketplacePlugin('evil/colon', { runPlugin });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('installMarketplacePlugin removes a github package that landed only in node_modules', async () => {
  const { calls, runPlugin } = recordRunner(() => {
    writeBarePlugin('@virex/dsh-status-rotator');
  });
  const result = await installMarketplacePlugin(GITHUB_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /可加载/);
  assert.deepEqual(calls, [['add', GITHUB_SPEC], ['remove', '@virex/dsh-status-rotator']]);
});

test('installMarketplacePlugin removes a github package already in the profile when it is not loadable', async () => {
  writeProfileDep('@virex/dsh-status-rotator', GITHUB_SPEC);
  writeBarePlugin('@virex/dsh-status-rotator');
  const { calls, runPlugin } = recordRunner();
  const result = await installMarketplacePlugin(GITHUB_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /可加载/);
  assert.ok(calls.some((args) => args[0] === 'remove' && args[1] === '@virex/dsh-status-rotator'));
});

test('installMarketplacePlugin removes a package whose bundle patch only sets patch: true', async () => {
  const { calls, runPlugin } = recordRunner(() => {
    writePlugin(NPM_SPEC, { dsh: { bundle: { patch: true } } });
  });
  const result = await installMarketplacePlugin(NPM_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, [['add', NPM_SPEC], ['remove', NPM_SPEC]]);
});

test('installMarketplacePlugin removes a package that inserts a duplicate loader id', async () => {
  writeProfileDep('@deepseek-ai/dsh-web-app', 'workspace:*');
  writePlugin('@deepseek-ai/dsh-web-app', {
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, {
    'cordis.patch.yml': '- insert:\n    - id: storage\n      name: @deepseek-ai/dsh-web-app\n',
  });
  const { calls, runPlugin } = recordRunner(() => {
    writePlugin(NPM_SPEC, {
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, {
      'cordis.patch.yml': '- insert:\n    - id: storage\n      name: dsh-composer-expand\n',
    });
  });
  const result = await installMarketplacePlugin(NPM_ID, { runPlugin });
  assert.equal(result.ok, false);
  assert.match(result.error, /storage/);
  assert.deepEqual(calls, [['add', NPM_SPEC], ['remove', NPM_SPEC]]);
});

test('parseAllowBuilds reads ndjson-escaped prepare-not-allowed package names', () => {
  const keys = parseAllowBuilds('{"msg":"The git-hosted package \\"dsh-loop@1.0.0\\" needs to execute build scripts but is not in the allowBuilds allowlist."}');
  assert.ok(keys.includes('dsh-loop'));
});

test('installMarketplacePlugin leaves a floating github ref when no token is stored', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.github.com')) {
      return { ok: true, status: 200, text: async () => 'abc1234567890' };
    }
    throw new Error('unexpected fetch');
  };
  try {
    const { calls, runPlugin } = recordRunner((spec) => {
      writeProfileDep('@virex/dsh-status-rotator', spec);
      writeClientPlugin('@virex/dsh-status-rotator');
    });
    const result = await installMarketplacePlugin(GITHUB_ID, { runPlugin, token: '' });
    assert.equal(result.ok, true);
    assert.deepEqual(calls[0], ['add', GITHUB_SPEC]);
    assert.equal(String(calls[0][1]).includes('abc1234567890'), false);
  } finally {
    globalThis.fetch = previous;
  }
});

test('installMarketplacePlugin pins a SHA when a GitHub token is stored', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.github.com')) {
      return { ok: true, status: 200, text: async () => 'abc1234567890' };
    }
    throw new Error('unexpected fetch');
  };
  try {
    const { calls, runPlugin } = recordRunner((spec) => {
      writeProfileDep('@virex/dsh-status-rotator', spec);
      writeClientPlugin('@virex/dsh-status-rotator');
    });
    const result = await installMarketplacePlugin(GITHUB_ID, { runPlugin, token: 'ghp_test' });
    assert.equal(result.ok, true);
    assert.deepEqual(calls[0], ['add', 'github:01Virex/dsh-status-rotator#abc1234567890']);
  } finally {
    globalThis.fetch = previous;
  }
});
