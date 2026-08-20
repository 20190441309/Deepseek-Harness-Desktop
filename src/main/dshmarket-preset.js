'use strict';

const fs = require('fs');
const path = require('path');
const { webProfileDir, upsertManagedBlock, stripBlockFromFile } = require('./plugins');

const DSHMARKET_PACKAGE = 'dshmarket';
const DSHMARKET_BEGIN = '# --- dshd-gui-dshmarket ---';
const DSHMARKET_END = '# --- end dshd-gui-dshmarket ---';

function defaultSourceDir() {
  try {
    const { projectRoot } = require('./paths');
    return path.join(projectRoot(), 'vendor', 'dshmarket');
  } catch {
    return path.join(__dirname, '..', '..', 'vendor', 'dshmarket');
  }
}

function profileListsBundle(profileDir) {
  const file = path.join(profileDir, 'package.json');
  if (!fs.existsSync(file)) {
    return false;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const bundles = manifest.dsh?.profile?.bundles;
    return Array.isArray(bundles) && bundles.includes(DSHMARKET_PACKAGE);
  } catch {
    return false;
  }
}

function dependencyPackageJson(root, name) {
  return path.join(root, 'node_modules', ...String(name).split('/'), 'package.json');
}

function missingRuntimeDependencies(sourceDir) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
  } catch {
    return ['package.json'];
  }
  const deps = pkg.dependencies && typeof pkg.dependencies === 'object'
    ? Object.keys(pkg.dependencies)
    : [];
  return deps.filter((name) => !fs.existsSync(dependencyPackageJson(sourceDir, name)));
}

function linkIntoProfileModules(destDir, profileDir) {
  const linked = path.join(profileDir, 'node_modules', DSHMARKET_PACKAGE);
  if (fs.existsSync(linked) && !fs.lstatSync(linked).isSymbolicLink()) {
    return;
  }
  fs.mkdirSync(path.dirname(linked), { recursive: true });
  if (fs.existsSync(linked)) {
    fs.unlinkSync(linked);
  }
  fs.symlinkSync(destDir, linked, process.platform === 'win32' ? 'junction' : 'dir');
}

/**
 * Copy the bundled dshmarket package into the web profile and register it
 * through a managed cordis.patch.yml insert. Does not call `dsh plugin add`.
 * Missing `package.json` or a declared dependency without `node_modules/<name>`
 * returns `{ ok: false }` and strips the managed insert so Loader does not
 * mount a broken copy. The caller logs that and continues Harness start.
 * @param {{ sourceDir?: string, profileDir?: string }} [options]
 */
function ensureDshMarketPlugin(options = {}) {
  const sourceDir = options.sourceDir || defaultSourceDir();
  if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
    return { ok: false, added: false, error: 'missing-source:package.json' };
  }
  const profileDir = options.profileDir || webProfileDir();
  const destDir = path.join(profileDir, 'desktop-plugins', DSHMARKET_PACKAGE);
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const missing = missingRuntimeDependencies(sourceDir);
  if (missing.length) {
    stripBlockFromFile(patchFile, DSHMARKET_BEGIN, DSHMARKET_END);
    return {
      ok: false,
      added: false,
      error: `missing-source:node_modules:${missing.join(',')}`,
    };
  }
  const existed = fs.existsSync(path.join(destDir, 'package.json'));
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true, force: true });
  linkIntoProfileModules(destDir, profileDir);
  if (profileListsBundle(profileDir)) {
    stripBlockFromFile(patchFile, DSHMARKET_BEGIN, DSHMARKET_END);
    return { ok: true, added: false, destDir };
  }
  const body = [
    '- insert:',
    '    - id: dsh-market',
    `      name: ${JSON.stringify(DSHMARKET_PACKAGE)}`,
  ].join('\n');
  upsertManagedBlock(patchFile, DSHMARKET_BEGIN, DSHMARKET_END, body);
  return {
    ok: true,
    added: !existed,
    destDir,
    patchFile,
  };
}

module.exports = {
  DSHMARKET_PACKAGE,
  DSHMARKET_BEGIN,
  DSHMARKET_END,
  ensureDshMarketPlugin,
};
