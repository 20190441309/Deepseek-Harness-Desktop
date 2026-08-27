'use strict';

const fs = require('fs');
const path = require('path');
const { DESKTOP_BUILTIN_VENDOR_PACKAGES } = require('../src/shared/desktop-builtin-packages');

function removeLinkOrDir(target) {
  if (!fs.existsSync(target)) {
    return;
  }
  try {
    fs.readlinkSync(target);
    fs.unlinkSync(target);
    return;
  } catch {
    // Directory or file.
  }
  const st = fs.lstatSync(target);
  if (st.isSymbolicLink() || st.isFile()) {
    fs.unlinkSync(target);
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * Junction/symlink (Windows) or dir symlink a vendored built-in into harness
 * node_modules so web-app cordis rows resolve by package name.
 * @param {string} harnessRoot
 * @param {string} projectRoot
 * @param {{ copy?: boolean }} [options] - copy instead of symlink for packaging.
 */
function linkDesktopBuiltinPackages(harnessRoot, projectRoot, options = {}) {
  const linked = [];
  for (const pkg of DESKTOP_BUILTIN_VENDOR_PACKAGES) {
    const sourceDir = path.join(projectRoot, 'vendor', pkg.vendorDir);
    if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
      throw new Error(`link-desktop-builtin: missing ${sourceDir}/package.json`);
    }
    const dest = path.join(harnessRoot, 'node_modules', ...pkg.name.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    removeLinkOrDir(dest);
    if (options.copy) {
      fs.cpSync(sourceDir, dest, { recursive: true, force: true });
    } else {
      fs.symlinkSync(sourceDir, dest, process.platform === 'win32' ? 'junction' : 'dir');
    }
    linked.push(pkg.name);
  }
  return linked;
}

module.exports = {
  linkDesktopBuiltinPackages,
  removeLinkOrDir,
};
