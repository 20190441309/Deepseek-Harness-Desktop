'use strict';

const LOG_ERROR_PATTERN = /ERR_[A-Z0-9_]+|Cannot find (?:package|module)|Error \[|plugin tree failed to load|cannot get property|cannot resolve profile bundle/;

function skipStartingCopy() {
  return {
    status: '正在以官方组合启动',
    hint: '第三方插件导致上次启动失败，已暂时跳过',
  };
}

function startupErrorLabel() {
  return '启动失败';
}

function retryActionLabel(runtimeFailure) {
  return runtimeFailure ? '立即重启' : '重试';
}

function downloadLogLabel() {
  return '下载日志';
}

function isImportantBootLog(line) {
  return LOG_ERROR_PATTERN.test(String(line ?? ''));
}

const api = {
  LOG_ERROR_PATTERN,
  skipStartingCopy,
  startupErrorLabel,
  retryActionLabel,
  downloadLogLabel,
  isImportantBootLog,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof globalThis === 'object') {
  globalThis.BootRecovery = api;
}
