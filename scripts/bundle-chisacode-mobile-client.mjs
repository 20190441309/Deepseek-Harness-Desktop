/**
 * Bundle @chisacode/client + protocol connection-offer for mobile/web.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorNm = path.join(root, 'vendor', 'chisacode-remote', 'node_modules');
const entry = path.join(root, 'mobile', 'web', 'chisacode', 'entry.mjs');
const outfile = path.join(root, 'mobile', 'web', 'chisacode', 'daemon-client.bundle.js');

const env = {
  ...process.env,
  NODE_PATH: [vendorNm, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
};

const result = spawnSync(
  'npx',
  [
    '--yes',
    'esbuild',
    entry,
    '--bundle',
    '--format=esm',
    '--platform=browser',
    '--target=es2022',
    `--outfile=${outfile}`,
    '--sourcemap',
  ],
  { cwd: root, stdio: 'inherit', shell: true, env },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}
console.log('wrote', outfile);
