'use strict';

/**
 * Desktop built-in components integrated into @deepseek-ai/dsh-web-app.
 * They are not user plugins: skip-user-plugins still loads them; Recovery
 * must not offer disable; marketplace must reject duplicate installs.
 */
const DESKTOP_BUILTIN_VENDOR_PACKAGES = [
  {
    vendorDir: 'dsh-im',
    name: '@xmanrui/dsh-im',
    loaderId: 'xmanrui-dsh-im',
    aliases: ['dsh-im', 'xmanrui-dsh-im'],
  },
  {
    vendorDir: 'dsh-usage-panel',
    name: 'dsh-usage-panel',
    loaderId: 'usage-stats',
    aliases: ['usage-stats'],
  },
];

const DESKTOP_BUILTIN_HOST_PACKAGES = [
  {
    dir: 'packages/host/desktop-install',
    name: '@deepseek-ai/dsh-desktop-install',
    loaderId: 'dshd-desktop-plugin-install',
    aliases: ['dshd-desktop-plugin-install'],
  },
];

const DESKTOP_BUILTIN_ALIASES = new Set(
  [...DESKTOP_BUILTIN_VENDOR_PACKAGES, ...DESKTOP_BUILTIN_HOST_PACKAGES]
    .flatMap((row) => [row.name, row.loaderId, ...(row.aliases || [])]),
);

/** Stable marketplace catalog ids that stay dropped regardless of package rename. */
const DROPPED_CATALOG_IDS = new Set([
  'omdsh-dev/dsh-genui',
]);

function isDesktopBuiltinAlias(name) {
  return DESKTOP_BUILTIN_ALIASES.has(String(name || '').trim());
}

module.exports = {
  DESKTOP_BUILTIN_VENDOR_PACKAGES,
  DESKTOP_BUILTIN_HOST_PACKAGES,
  DESKTOP_BUILTIN_ALIASES,
  DROPPED_CATALOG_IDS,
  isDesktopBuiltinAlias,
};
