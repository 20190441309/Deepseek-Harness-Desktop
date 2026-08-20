'use strict';

const PLUGIN_BOOT_FAILED = 'PLUGIN_BOOT_FAILED';

const PLUGIN_TREE_MARKERS = [
  'plugin tree failed to load',
  'cannot resolve profile bundle',
  'failed to apply loader entry',
  'entries did not activate',
];

/**
 * Classify composition / loader-tree failures from stderr, exit text, or logs.
 * `client-modules:` matches only composition failures, not Cordis bundle-route text.
 * @param {unknown} text
 * @returns {boolean}
 */
function isPluginTreeFailure(text) {
  const blob = String(text || '').toLowerCase();
  if (!blob) return false;
  if (PLUGIN_TREE_MARKERS.some((marker) => blob.includes(marker))) return true;
  if (!blob.includes('client-modules:')) return false;
  return blob.includes('clientpackagecompositionerror')
    || blob.includes('composition failed')
    || blob.includes('failed to compose')
    || blob.includes('组合失败');
}

module.exports = {
  PLUGIN_BOOT_FAILED,
  PLUGIN_TREE_MARKERS,
  isPluginTreeFailure,
};
