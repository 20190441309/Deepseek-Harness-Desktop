'use strict';

const fs = require('fs');
const path = require('path');
const { webProfileDir, stripBlockFromFile } = require('./plugins');

const USAGE_PANEL_PACKAGE = 'dsh-usage-panel';
const USAGE_PANEL_BEGIN = '# --- dshd-gui-usage-panel ---';
const USAGE_PANEL_END = '# --- end dshd-gui-usage-panel ---';

/**
 * @deprecated Usage stats composes through @deepseek-ai/dsh-web-app. Strips
 * legacy managed blocks and overlay files only.
 */
function ensureUsagePanelPlugin(options = {}) {
  const { migrateLegacyDesktopBuiltins } = require('./desktop-builtin-migrate');
  const result = migrateLegacyDesktopBuiltins(options);
  return {
    ok: true,
    added: false,
    destDir: null,
    overlayFile: null,
    migrated: result,
  };
}

module.exports = {
  USAGE_PANEL_PACKAGE,
  USAGE_PANEL_BEGIN,
  USAGE_PANEL_END,
  ensureUsagePanelPlugin,
};
