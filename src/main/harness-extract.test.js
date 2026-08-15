'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return { app: {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { tarCommand } = require('./harness-extract');
Module._load = originalLoad;

test('tarCommand uses PATH tar outside Windows', () => {
  assert.equal(tarCommand('linux'), 'tar');
  assert.equal(tarCommand('darwin'), 'tar');
});

test('tarCommand prefers the Windows system tar for local absolute paths', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-tar-test-'));
  const system32 = path.join(root, 'System32');
  const executable = path.join(system32, 'tar.exe');
  fs.mkdirSync(system32, { recursive: true });
  fs.writeFileSync(executable, '');
  const previousSystemRoot = process.env.SystemRoot;
  const previousWindir = process.env.WINDIR;
  process.env.SystemRoot = root;
  delete process.env.WINDIR;
  t.after(() => {
    if (previousSystemRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = previousSystemRoot;
    if (previousWindir === undefined) delete process.env.WINDIR;
    else process.env.WINDIR = previousWindir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(tarCommand('win32'), executable);
});

test('tarCommand falls back to PATH when system tar is unavailable', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-system-tar-'));
  const previousSystemRoot = process.env.SystemRoot;
  const previousWindir = process.env.WINDIR;
  process.env.SystemRoot = root;
  delete process.env.WINDIR;
  t.after(() => {
    if (previousSystemRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = previousSystemRoot;
    if (previousWindir === undefined) delete process.env.WINDIR;
    else process.env.WINDIR = previousWindir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(tarCommand('win32'), 'tar');
});
