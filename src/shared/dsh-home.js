'use strict';

const path = require('path');

const DESKTOP_DSH_HOME_DIRNAME = 'dsh-home';
const UNSET_ERROR = 'desktop DSH home is not configured';

let configuredHome = '';

function desktopDshHomeFromUserData(userData) {
  if (typeof userData !== 'string' || !userData.trim()) {
    throw new Error(UNSET_ERROR);
  }
  return path.join(path.resolve(userData.trim()), DESKTOP_DSH_HOME_DIRNAME);
}

function setDesktopDshHome(dir) {
  if (typeof dir !== 'string' || !dir.trim()) {
    throw new Error(UNSET_ERROR);
  }
  configuredHome = path.resolve(dir.trim());
  return configuredHome;
}

function clearDesktopDshHome() {
  configuredHome = '';
}

function getDesktopDshHome() {
  const fromEnv = process.env.DSHD_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  if (configuredHome) {
    return configuredHome;
  }
  throw new Error(UNSET_ERROR);
}

function tryGetDesktopDshHome() {
  try {
    return getDesktopDshHome();
  } catch {
    return '';
  }
}

function applyDesktopDshHome(env = {}) {
  const next = { ...env };
  for (const key of Object.keys(next)) {
    if (key.toUpperCase() === 'DSH_HOME') delete next[key];
  }
  next.DSH_HOME = getDesktopDshHome();
  return next;
}

module.exports = {
  DESKTOP_DSH_HOME_DIRNAME,
  desktopDshHomeFromUserData,
  setDesktopDshHome,
  clearDesktopDshHome,
  getDesktopDshHome,
  tryGetDesktopDshHome,
  applyDesktopDshHome,
};
