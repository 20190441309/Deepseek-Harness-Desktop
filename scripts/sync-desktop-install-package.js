'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const hostSrc = path.join(root, 'src', 'host');
const destDir = path.join(root, 'vendor', 'deepseek-harness', 'packages', 'host', 'desktop-install');

const FILES = [
  'install-dsh-plugin.mjs',
  'install-dsh-plugin-client.js',
];

const PACKAGE_JSON = {
  name: '@deepseek-ai/dsh-desktop-install',
  description: 'Desktop-owned model tool for installing marketplace plugins into the web profile',
  version: '0.1.1-rc.1',
  private: true,
  type: 'module',
  main: 'install-dsh-plugin.mjs',
  exports: {
    '.': './install-dsh-plugin.mjs',
    './package.json': './package.json',
  },
  files: [
    'install-dsh-plugin.mjs',
    'install-dsh-plugin-client.js',
    'package.json',
  ],
  license: 'MIT',
};

function syncDesktopInstallPackage() {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of FILES) {
    const src = path.join(hostSrc, name);
    if (!fs.existsSync(src)) {
      throw new Error(`sync-desktop-install: missing source ${src}`);
    }
    fs.copyFileSync(src, path.join(destDir, name));
  }
  const manifest = path.join(destDir, 'package.json');
  const next = `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`;
  const existing = fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : '';
  if (existing !== next) {
    fs.writeFileSync(manifest, next, 'utf8');
  }
  return destDir;
}

if (require.main === module) {
  console.log(`Synced desktop-install → ${syncDesktopInstallPackage()}`);
}

module.exports = { syncDesktopInstallPackage, destDir, FILES };
