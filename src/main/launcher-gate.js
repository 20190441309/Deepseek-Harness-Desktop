'use strict';

const fs = require('fs');
const path = require('path');

function lastDesktopStartPath(userDataDir) {
  return path.join(userDataDir, 'last-desktop-start.json');
}

function readLastDesktopStart(userDataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(lastDesktopStartPath(userDataDir), 'utf8'));
    return {
      ok: raw.ok === true ? true : raw.ok === false ? false : null,
      at: typeof raw.at === 'string' ? raw.at : '',
      error: typeof raw.error === 'string' ? raw.error : '',
    };
  } catch {
    return { ok: null, at: '', error: '' };
  }
}

function writeLastDesktopStart(userDataDir, payload) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const file = lastDesktopStartPath(userDataDir);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({
    ok: payload.ok === true,
    at: payload.at || new Date().toISOString(),
    error: payload.error || '',
  }, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function shouldPromptUpdate({ askOnUpdate, check }) {
  return askOnUpdate !== false && check && check.status === 'available';
}

function shouldAutoStartDesktop({
  autoStartDesktop,
  holdForImport,
  updatePromptPending,
  lastStartFailed,
}) {
  if (autoStartDesktop === false) return false;
  if (holdForImport) return false;
  if (updatePromptPending) return false;
  if (lastStartFailed) return false;
  return true;
}

function shouldCloseLauncher({ desktopReady, quitAfterStart }) {
  return desktopReady === true && quitAfterStart !== false;
}

/** Launcher may close only after a confirmed healthy full start. */
function shouldCloseLauncherAfterDesktopStart({
  desktopReady,
  quitAfterStart,
  stickySkip,
  recoveryLaunch,
  lastStartOk,
}) {
  if (!shouldCloseLauncher({ desktopReady, quitAfterStart })) {
    return false;
  }
  if (stickySkip || recoveryLaunch) {
    return false;
  }
  return lastStartOk === true;
}

module.exports = {
  lastDesktopStartPath,
  readLastDesktopStart,
  writeLastDesktopStart,
  shouldPromptUpdate,
  shouldAutoStartDesktop,
  shouldCloseLauncher,
  shouldCloseLauncherAfterDesktopStart,
};
