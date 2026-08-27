'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseBlocks,
  mergeBlocks,
  resolveValue,
  normalize,
  compareTokenMirror,
} = require('./dsh-webui-token-mirror');

test('parseBlocks keeps custom properties per selector and skips at-rules', () => {
  const blocks = parseBlocks(`
    /* comment { with brace */
    :root { --a: rgb(1, 2, 3); color-scheme: light; --b: var(--a); }
    @media (prefers-reduced-motion: reduce) { :root { --a: none; } }
    body[data-ds-dark-theme] { --a: rgb(4, 5, 6); }
  `);
  assert.deepEqual(blocks.map((block) => block.selector), [':root', 'body[data-ds-dark-theme]']);
  assert.equal(blocks[0].decls.get('--a'), 'rgb(1, 2, 3)');
  assert.equal(blocks[0].decls.get('--b'), 'var(--a)');
  assert.equal(blocks[0].decls.has('color-scheme'), false);
  assert.equal(blocks[1].decls.get('--a'), 'rgb(4, 5, 6)');
});

test('parseBlocks rejects unbalanced braces', () => {
  assert.throws(() => parseBlocks('body { --a: 1;'), /unbalanced/);
});

test('mergeBlocks lets later blocks override earlier ones', () => {
  const blocks = parseBlocks('body { --a: 1; --b: 2; } body { --a: 3; }');
  const merged = mergeBlocks(blocks, (selector) => selector === 'body');
  assert.equal(merged.get('--a'), '3');
  assert.equal(merged.get('--b'), '2');
});

test('resolveValue follows var() chains and leaves unknown references', () => {
  const table = new Map([
    ['--base', 'rgb(1, 2, 3)'],
    ['--alias', 'var(--base)'],
    ['--pct', '80%'],
  ]);
  assert.equal(resolveValue('var(--alias)', table), 'rgb(1, 2, 3)');
  assert.equal(
    resolveValue('color-mix(in srgb, var(--base) var(--pct), transparent)', table),
    'color-mix(in srgb, rgb(1, 2, 3) 80%, transparent)',
  );
  assert.equal(resolveValue('var(--nope)', table), 'var(--nope)');
});

test('resolveValue rejects cyclic chains', () => {
  const table = new Map([['--x', 'var(--y)'], ['--y', 'var(--x)']]);
  assert.throws(() => resolveValue('var(--x)', table), /cyclic/);
});

test('normalize collapses whitespace inside multi-line values', () => {
  assert.equal(
    normalize('0 0 1px 0 rgba(0, 0, 0, 0.2),\n    0 12px 32px 0 rgba(0,0,0,0.08)'),
    '0 0 1px 0 rgba(0, 0, 0, 0.2), 0 12px 32px 0 rgba(0, 0, 0, 0.08)',
  );
});

test('compareTokenMirror flags value drift and missing upstream tokens per theme', () => {
  const mirror = `
    :root { --dsw-alias-bg-base: rgb(255, 255, 255); --dsw-alias-gone: rgb(0, 0, 0); --ds-not-checked: 1s; }
    html[data-ds-dark-theme] { --dsw-alias-bg-base: rgb(0, 0, 0); }
  `;
  const vendor = `
    body { --dsw-static-white: rgb(255, 255, 255); --dsw-alias-bg-base: var(--dsw-static-white); }
    body[data-ds-dark-theme] { --dsw-alias-bg-base: rgb(21, 21, 23); }
  `;
  const result = compareTokenMirror(mirror, vendor);
  assert.equal(result.checked, 3);
  assert.deepEqual(result.problems, [
    { token: '--dsw-alias-gone', theme: 'light', kind: 'missing-upstream', mirror: 'rgb(0, 0, 0)', vendor: null },
    { token: '--dsw-alias-bg-base', theme: 'dark', kind: 'value-drift', mirror: 'rgb(0, 0, 0)', vendor: 'rgb(21, 21, 23)' },
  ]);
});

test('compareTokenMirror resolves the dark table over the light cascade', () => {
  const mirror = 'html[data-ds-dark-theme] { --dsw-specific-menu: color-mix(in srgb, rgb(53, 54, 56) 80%, transparent); }';
  const vendor = `
    body { --dsw-alias-glass-opacity: 80%; --dsw-specific-menu: color-mix(in srgb, var(--layer) var(--dsw-alias-glass-opacity), transparent); --layer: rgb(255, 255, 255); }
    body[data-ds-dark-theme] { --layer: rgb(53, 54, 56); }
  `;
  const result = compareTokenMirror(mirror, vendor);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.problems, []);
});

// The real gate: the hand-mirrored shell token sheet must match the official
// ui-theme value table (design-language mandate; decoupling analysis §6.5).
test('src/shared/dsh-webui-tokens.css matches ui-theme design-platform.css', () => {
  const root = path.join(__dirname, '..', '..');
  const mirror = fs.readFileSync(path.join(root, 'src', 'shared', 'dsh-webui-tokens.css'), 'utf8');
  const vendor = fs.readFileSync(
    path.join(root, 'vendor', 'deepseek-harness', 'packages', 'client', 'ui-theme', 'src', 'styles', 'design-platform.css'),
    'utf8',
  );
  const result = compareTokenMirror(mirror, vendor);
  assert.ok(result.checked >= 60, `expected to check at least 60 mirrored tokens, saw ${result.checked}`);
  assert.deepEqual(
    result.problems,
    [],
    'dsh-webui-tokens.css drifted from design-platform.css — re-mirror the flagged tokens (both themes)',
  );
});
