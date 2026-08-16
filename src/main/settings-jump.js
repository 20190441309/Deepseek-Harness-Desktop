'use strict';

// Harness settings sections are kebab-case slot ids ('mcp', 'skills',
// 'plugins', 'about'). Validating here keeps arbitrary caller strings out of
// the injected CSS selector in buildSettingsSectionScript().
const SETTINGS_SECTION_ID = /^[a-z][a-z0-9-]*$/;

/**
 * Normalize a requested settings section id.
 *
 * @param {unknown} sectionId - caller-provided section id.
 * @returns {{ ok: true, section: string } | { ok: false }} normalized section
 *   ('' opens the default section) or a rejection for invalid input.
 */
function normalizeSettingsSection(sectionId) {
  const requested = typeof sectionId === 'string' ? sectionId.trim() : '';
  if (requested.length === 0) {
    return { ok: true, section: '' };
  }
  if (!SETTINGS_SECTION_ID.test(requested)) {
    return { ok: false };
  }
  return { ok: true, section: requested };
}

/**
 * Build the in-page script that opens the settings dialog and navigates to a
 * section. Must stay in sync with the web UI contract:
 * [data-dsh-settings-trigger] opens the dialog and
 * [data-dsh-settings-section="<id>"] is the nav row.
 *
 * @param {string} section - normalized section id; '' keeps the default.
 * @returns {string} script for webContents.executeJavaScript.
 */
function buildSettingsSectionScript(section) {
  const id = JSON.stringify(section);
  return `
    (() => {
      const trigger = document.querySelector('[data-dsh-settings-trigger]');
      if (!trigger) return false;
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      const id = ${id};
      if (!id) return true;
      return new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          const nav = document.querySelector('[data-dsh-settings-section="' + id + '"]');
          if (nav) {
            nav.click();
            resolve(true);
            return;
          }
          if (n++ > 40) {
            resolve(false);
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });
    })()
  `;
}

module.exports = { normalizeSettingsSection, buildSettingsSectionScript };
