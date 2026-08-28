import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

// 一码两入口（mobile-remote 卡）：App 内扫码＝链接设备，相机/浏览器扫码＝web 端。
// 落地页必须把这个分流讲给用户。
test('landing page explains the one-QR entry split (App = link device, browser = web client)', () => {
  assert.match(indexHtml, /id="entry-split-hint"/);
  assert.match(indexHtml, /web 端/);
  assert.match(indexHtml, /App 内扫同一张码＝链接设备/);
});

// 浏览器扫码打开本页必须自动连入 web 端；谁要是把这条路径改成「仅设备配对」
// 或要求二次确认，就破坏了「浏览器等其他设备扫码出 web 端」的产品行为。
test('browser scan keeps auto-connecting into the web client on #offer= boot', () => {
  assert.match(
    appJs,
    /hasOfferFragment\(window\.location\.hash\)/,
    '启动块必须检测 #offer= 并自动 connect()（浏览器 = web 端）',
  );
  assert.match(appJs, /connect\(window\.location\.href\)/);
});
