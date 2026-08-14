/**
 * Parse package names pnpm asked the user to allow-build.
 * @param {string} log
 * @returns {string[]}
 */
function parseAllowBuilds(log) {
  const text = String(log || '');
  const names = new Set();
  const ignored = text.match(/ignored build scripts:\s*([^\n]+)/i);
  if (ignored) {
    for (const part of ignored[1].split(/[,\s]+/)) {
      const name = part.replace(/@\d[\w.-]*$/, '').trim();
      if (name && /[@a-z0-9._/-]/i.test(name) && !/^https?:/i.test(name)) {
        names.add(name);
      }
    }
  }
  for (const match of text.matchAll(/^\s{2,}([@a-z0-9._/-]+(?:\/[a-z0-9._-]+)?)\s*$/gim)) {
    const name = match[1];
    if (name && !/^(run|add|the|following|dependencies|ignored)$/i.test(name)) {
      names.add(name);
    }
  }
  for (const match of text.matchAll(/["'](@?[\w.-]+(?:[/.][\w.-]+)*)["']\s*:\s*(?:true|false)/g)) {
    names.add(match[1]);
  }
  return [...names].filter((name) => name.length > 1 && name.length < 120);
}

module.exports = { parseAllowBuilds };
