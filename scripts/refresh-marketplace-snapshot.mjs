#!/usr/bin/env node
'use strict';

/**
 * Refresh the bundled offline marketplace snapshot from the live registry.
 * Run before release or when the curated catalog changes materially.
 *
 *   node scripts/refresh-marketplace-snapshot.mjs [--max-plugins N]
 *
 * Writes src/main/marketplace-registry-snapshot.json (minimal curated subset
 * for first offline boot — not a full mirror of the live 2000+ row catalog).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'src', 'main', 'marketplace-registry-snapshot.json');
const registryUrl = process.env.DSHD_MARKETPLACE_REGISTRY_URL || 'https://awesome-dsh-plugin.com/plugins.json';
const maxPlugins = Number(process.argv.find((arg, i) => process.argv[i - 1] === '--max-plugins') || 200);

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(registryUrl, {
      headers: { 'User-Agent': 'Deepseek-Harness-Desktop' },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`registry HTTP ${response.status}`);
    }
    const body = JSON.parse(text);
    if (!body || !Array.isArray(body.plugins) || body.plugins.length === 0) {
      throw new Error('registry empty');
    }
    const plugins = body.plugins.slice(0, maxPlugins);
    const snapshot = {
      name: body.name || 'awesome-dsh-plugin',
      url: body.url || 'https://awesome-dsh-plugin.com',
      source: body.source || registryUrl,
      updated: new Date().toISOString().slice(0, 10),
      count: plugins.length,
      categories: body.categories || {},
      plugins,
    };
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${plugins.length} plugins to ${snapshotPath}`);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
