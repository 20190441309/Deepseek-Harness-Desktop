'use strict';

const fs = require('fs');
const path = require('path');
const { webProfileDir, stripBlockFromFile } = require('./plugins');
const {
  DESKTOP_INSTALL_BEGIN,
  DESKTOP_INSTALL_END,
  LEGACY_DESKTOP_INSTALL_BEGIN,
  LEGACY_DESKTOP_INSTALL_END,
} = require('./plugins');
const {
  USAGE_PANEL_BEGIN,
  USAGE_PANEL_END,
} = require('./usage-panel-preset');
const {
  DSH_IM_BEGIN,
  DSH_IM_END,
  removeLegacyDesktopCopy,
} = require('./dsh-im-desktop');

const LEGACY_OVERLAY_PATHS = [
  ['desktop-plugins', 'install-dsh-plugin', 'desktop-install.patch.yml'],
  ['desktop-plugins', 'install-dsh-plugin', 'skip-user-plugins.patch.yml'],
  ['desktop-plugins', 'dsh-usage-panel', 'desktop-usage-panel.patch.yml'],
];

function removeIfExists(file) {
  if (!fs.existsSync(file)) {
    return false;
  }
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strip legacy managed blocks and desktop-owned overlay files from the user
 * profile. Built-ins now compose through @deepseek-ai/dsh-web-app; leaving
 * stale inserts would double-mount (CLI insert does not dedupe by id).
 * @param {{ profileDir?: string }} [options]
 */
function migrateLegacyDesktopBuiltins(options = {}) {
  const profileDir = options.profileDir || webProfileDir();
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const stripped = {
    install: stripBlockFromFile(patchFile, DESKTOP_INSTALL_BEGIN, DESKTOP_INSTALL_END)
      || stripBlockFromFile(patchFile, LEGACY_DESKTOP_INSTALL_BEGIN, LEGACY_DESKTOP_INSTALL_END),
    usage: stripBlockFromFile(patchFile, USAGE_PANEL_BEGIN, USAGE_PANEL_END),
    im: stripBlockFromFile(patchFile, DSH_IM_BEGIN, DSH_IM_END),
  };
  removeLegacyDesktopCopy(profileDir);
  const removedOverlays = [];
  for (const parts of LEGACY_OVERLAY_PATHS) {
    const file = path.join(profileDir, ...parts);
    if (removeIfExists(file)) {
      removedOverlays.push(parts.join('/'));
    }
  }
  return {
    ok: true,
    profileDir,
    patchFile,
    stripped,
    removedOverlays,
    changed: stripped.install || stripped.usage || stripped.im || removedOverlays.length > 0,
  };
}

module.exports = {
  migrateLegacyDesktopBuiltins,
};
