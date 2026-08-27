'use strict';

/**
 * Token mirror drift check (decoupling Phase 0): src/shared/dsh-webui-tokens.css
 * hand-mirrors the official value table from
 * vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css
 * for shells that cannot import ui-theme (launcher, boot, installer bitmaps).
 * This module makes the parity machine-checked: parse both sheets, resolve the
 * vendor var() chains to literal values, and compare every mirrored
 * --dsw-alias-* / --dsw-static-* / --dsw-specific-* token in both themes.
 * Tokens the mirror takes from other official sources (--ds-* motion/font,
 * --dsw-shadow-*, --dsw-mask-blur, --dsw-font-family) are out of scope.
 */

const MIRRORED_TOKEN = /^--dsw-(alias|static|specific)-/;

/**
 * Parse flat CSS into { selector, decls } blocks. At-rule blocks (@media …)
 * are skipped whole; both sheets keep compared tokens outside at-rules.
 *
 * @param {string} css
 * @returns {{ selector: string, decls: Map<string, string> }[]}
 */
function parseBlocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) {
      break;
    }
    const selector = text.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') {
        depth += 1;
      } else if (text[j] === '}') {
        depth -= 1;
      }
      j += 1;
    }
    if (depth !== 0) {
      throw new Error(`unbalanced braces after selector ${JSON.stringify(selector)}`);
    }
    if (!selector.startsWith('@')) {
      blocks.push({ selector, decls: parseDeclarations(text.slice(open + 1, j - 1)) });
    }
    i = j;
  }
  return blocks;
}

/**
 * @param {string} body
 * @returns {Map<string, string>} custom-property declarations only
 */
function parseDeclarations(body) {
  const decls = new Map();
  for (const raw of body.split(';')) {
    const colon = raw.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const name = raw.slice(0, colon).trim();
    if (name.startsWith('--')) {
      decls.set(name, raw.slice(colon + 1).trim());
    }
  }
  return decls;
}

/**
 * Merge the declarations of every block whose selector satisfies `match`,
 * later blocks overriding earlier ones (source-order cascade at equal
 * specificity, which is how both sheets are written).
 *
 * @param {{ selector: string, decls: Map<string, string> }[]} blocks
 * @param {(selector: string) => boolean} match
 * @returns {Map<string, string>}
 */
function mergeBlocks(blocks, match) {
  const merged = new Map();
  for (const block of blocks) {
    if (match(block.selector)) {
      for (const [name, value] of block.decls) {
        merged.set(name, value);
      }
    }
  }
  return merged;
}

/**
 * Resolve var(--x) references against a declaration table until the value is
 * literal. Unknown references are left in place so the comparison reports
 * them as a mismatch instead of hiding the drift.
 *
 * @param {string} value
 * @param {Map<string, string>} table
 * @returns {string}
 */
function resolveValue(value, table) {
  let current = value;
  for (let round = 0; round < 10; round += 1) {
    const next = current.replace(/var\((--[\w-]+)\)/g, (whole, name) => (table.has(name) ? table.get(name) : whole));
    if (next === current) {
      return current;
    }
    current = next;
  }
  throw new Error(`var() chain too deep or cyclic in ${JSON.stringify(value)}`);
}

/** @param {string} value */
function normalize(value) {
  return value.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,\s*/g, ', ').trim();
}

const isDark = (selector) => selector.includes('data-ds-dark-theme');

/**
 * @param {string} mirrorCss  src/shared/dsh-webui-tokens.css contents
 * @param {string} vendorCss  ui-theme design-platform.css contents
 * @returns {{ checked: number, problems: { token: string, theme: 'light'|'dark', kind: 'missing-upstream'|'value-drift', mirror: string, vendor: string|null }[] }}
 */
function compareTokenMirror(mirrorCss, vendorCss) {
  const mirrorBlocks = parseBlocks(mirrorCss);
  const vendorBlocks = parseBlocks(vendorCss);

  const vendorLight = mergeBlocks(vendorBlocks, (selector) => !isDark(selector));
  const vendorDark = new Map([
    ...vendorLight,
    ...mergeBlocks(vendorBlocks, isDark),
  ]);
  const themes = [
    { theme: 'light', mirror: mergeBlocks(mirrorBlocks, (selector) => !isDark(selector)), vendor: vendorLight },
    { theme: 'dark', mirror: mergeBlocks(mirrorBlocks, isDark), vendor: vendorDark },
  ];

  const problems = [];
  let checked = 0;
  for (const { theme, mirror, vendor } of themes) {
    for (const [token, mirrorValue] of mirror) {
      if (!MIRRORED_TOKEN.test(token)) {
        continue;
      }
      checked += 1;
      if (!vendor.has(token)) {
        problems.push({ token, theme, kind: 'missing-upstream', mirror: normalize(mirrorValue), vendor: null });
        continue;
      }
      const vendorValue = normalize(resolveValue(vendor.get(token), vendor));
      const mirrored = normalize(resolveValue(mirrorValue, mirror));
      if (vendorValue !== mirrored) {
        problems.push({ token, theme, kind: 'value-drift', mirror: mirrored, vendor: vendorValue });
      }
    }
  }
  return { checked, problems };
}

module.exports = {
  MIRRORED_TOKEN,
  parseBlocks,
  mergeBlocks,
  resolveValue,
  normalize,
  compareTokenMirror,
};
