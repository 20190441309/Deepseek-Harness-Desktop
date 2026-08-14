const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSimpleYaml, resolveTheme, FAMILY_SEEDS, listThemes } = require('./themes');

test('parseSimpleYaml reads a ui-theme section with custom families', () => {
  const doc = parseSimpleYaml(`
ui-theme:
  preference: dark
  activeDarkThemeId: grove
  customThemes:
    - id: grove
      name: Grove
      origin: custom
      light:
        accent: "#0f766e"
        background: "#f3faf7"
        foreground: "#10211c"
        contrast: 44
      dark:
        accent: "#3dd6b5"
        background: "#071411"
        foreground: "#e7f6f1"
        contrast: 50
`);
  assert.equal(doc['ui-theme'].preference, 'dark');
  assert.equal(doc['ui-theme'].customThemes[0].id, 'grove');
  assert.equal(doc['ui-theme'].customThemes[0].dark.accent, '#3dd6b5');
});

test('resolveTheme uses the dark half of a named family', () => {
  const theme = resolveTheme({}, {
    harness: { preference: 'dark', activeDarkThemeId: 'celadon' },
    systemDark: false,
  });
  assert.equal(theme.id, 'celadon');
  assert.equal(theme.scheme, 'dark');
  assert.equal(theme.bg, FAMILY_SEEDS.celadon.dark.background);
  assert.equal(theme.accent, FAMILY_SEEDS.celadon.dark.accent);
});

test('resolveTheme follows system preference and lists builtin families', () => {
  const light = resolveTheme({}, { harness: { preference: 'system' }, systemDark: false });
  assert.equal(light.scheme, 'light');
  assert.equal(light.id, 'deepseek');
  const dark = resolveTheme({}, { harness: { preference: 'system' }, systemDark: true });
  assert.equal(dark.scheme, 'dark');
  assert.ok(listThemes().some((item) => item.id === 'paper'));
});
