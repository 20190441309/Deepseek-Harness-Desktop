'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DESKTOP_PACKAGES = [
  { dir: 'packages/client/ui-agents-panel', name: '@deepseek-ai/dsh-client-ui-agents-panel' },
  { dir: 'packages/client/ui-diff', name: '@deepseek-ai/dsh-client-ui-diff' },
  { dir: 'packages/client/ui-files', name: '@deepseek-ai/dsh-client-ui-files' },
  { dir: 'packages/client/ui-git', name: '@deepseek-ai/dsh-client-ui-git' },
  { dir: 'packages/client/ui-message-edit', name: '@deepseek-ai/dsh-client-ui-message-edit' },
  { dir: 'packages/client/ui-preview', name: '@deepseek-ai/dsh-client-ui-preview' },
  { dir: 'packages/client/ui-settings-mcp', name: '@deepseek-ai/dsh-client-ui-settings-mcp' },
  { dir: 'packages/client/ui-settings-remote', name: '@deepseek-ai/dsh-client-ui-settings-remote' },
  { dir: 'packages/client/ui-settings-skills', name: '@deepseek-ai/dsh-client-ui-settings-skills' },
  { dir: 'packages/client/ui-surfaces', name: '@deepseek-ai/dsh-client-ui-surfaces' },
  { dir: 'packages/client/ui-titlebar', name: '@deepseek-ai/dsh-client-ui-titlebar' },
  { dir: 'packages/client/ui-user-terminal', name: '@deepseek-ai/dsh-client-ui-user-terminal' },
  { dir: 'packages/host/mcp-servers', name: '@deepseek-ai/dsh-host-mcp-servers' },
  { dir: 'packages/host/skill-inventory', name: '@deepseek-ai/dsh-host-skill-inventory' },
  { dir: 'packages/llm/llm-vision-fallback', name: '@deepseek-ai/dsh-llm-vision-fallback' },
  { dir: 'packages/mcp/mcp-servers-file', name: '@deepseek-ai/dsh-mcp-servers-file' },
  { dir: 'packages/client/ui-directory-picker-browse', name: '@deepseek-ai/dsh-client-ui-directory-picker-browse' },
  { dir: 'packages/host/directory-picker-browse', name: '@deepseek-ai/dsh-host-directory-picker-browse' },
];

const COMPOSITION_ROWS = [
  { file: 'packages/bundle/base/cordis.patch.yml', id: 'llm-vision-fallback', name: '@deepseek-ai/dsh-llm-vision-fallback', configIncludes: ['maxOutputTokens: 2048', 'timeoutMs: 120000'] },
  { file: 'packages/bundle/base/cordis.patch.yml', id: 'mcp-servers-file', name: '@deepseek-ai/dsh-mcp-servers-file' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'directory-picker', name: '@deepseek-ai/dsh-host-directory-picker-browse' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'mcp-servers', name: '@deepseek-ai/dsh-host-mcp-servers' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'skill-inventory', name: '@deepseek-ai/dsh-host-skill-inventory' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-titlebar', name: '@deepseek-ai/dsh-client-ui-titlebar' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-git', name: '@deepseek-ai/dsh-client-ui-git' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-user-terminal', name: '@deepseek-ai/dsh-client-ui-user-terminal' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-surfaces', name: '@deepseek-ai/dsh-client-ui-surfaces' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-files', name: '@deepseek-ai/dsh-client-ui-files' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-diff', name: '@deepseek-ai/dsh-client-ui-diff' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-preview', name: '@deepseek-ai/dsh-client-ui-preview' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-agents-panel', name: '@deepseek-ai/dsh-client-ui-agents-panel' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-settings-mcp', name: '@deepseek-ai/dsh-client-ui-settings-mcp' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-settings-skills', name: '@deepseek-ai/dsh-client-ui-settings-skills' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-message-edit', name: '@deepseek-ai/dsh-client-ui-message-edit' },
  { file: 'packages/bundle/web-app/cordis.patch.yml', id: 'ui-directory-picker-browse', name: '@deepseek-ai/dsh-client-ui-directory-picker-browse' },
];

const LAYOUT_MARKERS = ['surfaces', 'shell.titlebar.trailing', 'shell.terminalDrawer'];

function readRel(vendorRoot, rel) {
  return fs.readFileSync(path.join(vendorRoot, ...rel.split('/')), 'utf8');
}

function rowBlock(text, id) {
  const pattern = new RegExp(`^\\s*- id: ${id}\\s*$`, 'm');
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }
  const start = match.index;
  const after = text.slice(start + match[0].length);
  const next = after.search(/^\s*- id:/m);
  return text.slice(start, start + match[0].length + (next === -1 ? after.length : next));
}

/**
 * @param {string} vendorRoot
 * @param {string} npmVersion
 */
function assertDesktopForks(vendorRoot, npmVersion) {
  const missing = [];
  const webApp = JSON.parse(readRel(vendorRoot, 'packages/bundle/web-app/package.json'));
  const baseApp = JSON.parse(readRel(vendorRoot, 'packages/bundle/base/package.json'));
  const deps = {
    ...baseApp.dependencies,
    ...baseApp.devDependencies,
    ...webApp.dependencies,
    ...webApp.devDependencies,
  };
  const clientTsconfig = readRel(vendorRoot, 'tsconfig.client.json');
  const layout = readRel(vendorRoot, 'packages/client/ui-layout/src/client/index.ts');
  const scoped = readRel(vendorRoot, 'packages/client/web-react/src/scoped-slots.tsx');

  for (const pkg of DESKTOP_PACKAGES) {
    const manifestPath = path.join(vendorRoot, ...pkg.dir.split('/'), 'package.json');
    if (!fs.existsSync(manifestPath)) {
      missing.push(pkg.dir);
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== pkg.name) {
      throw new Error(`${pkg.dir} name is ${manifest.name}, expected ${pkg.name}`);
    }
    if (manifest.version !== npmVersion) {
      throw new Error(`${pkg.dir} version is ${manifest.version}, expected ${npmVersion}`);
    }
    if (!deps[pkg.name]) {
      throw new Error(`bundle package.json is missing ${pkg.name}`);
    }
    if (pkg.dir.startsWith('packages/client/') && !clientTsconfig.includes(`./${pkg.dir}`)) {
      throw new Error(`tsconfig.client.json is missing ${pkg.dir}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`missing desktop packages: ${missing.join(', ')}`);
  }

  const files = new Map();
  for (const row of COMPOSITION_ROWS) {
    if (!files.has(row.file)) {
      files.set(row.file, readRel(vendorRoot, row.file));
    }
    const block = rowBlock(files.get(row.file), row.id);
    if (!block) {
      throw new Error(`${row.file} is missing composition id ${row.id}`);
    }
    if (!block.includes(row.name)) {
      throw new Error(`${row.file} id ${row.id} does not name ${row.name}`);
    }
    for (const snippet of row.configIncludes || []) {
      if (!block.includes(snippet)) {
        throw new Error(`${row.file} id ${row.id} is missing ${snippet}`);
      }
    }
  }

  for (const marker of LAYOUT_MARKERS) {
    if (!layout.includes(marker)) {
      throw new Error(`ui-layout is missing ${marker}`);
    }
  }
  if (!scoped.includes('session-maybe') || !scoped.includes("? ''")) {
    throw new Error('scoped-slots.tsx no longer binds session-maybe to an empty string');
  }
}

module.exports = {
  DESKTOP_PACKAGES,
  COMPOSITION_ROWS,
  assertDesktopForks,
};
