# 手机远程

中文 · 扫桌面 **远程** 弹窗里的二维码。密钥只在 `#offer=`。浏览器打开 `mobile/web` 独立 SPA；Android 打开 `mobile/android` Kotlin Compose 应用。都不是官方四栏 `dsh web`。

## Web

1. 桌面打开远程，选局域网或 HTTPS 中继。
2. 系统相机 / 浏览器扫码；SPA 内也有「扫描二维码」（`BarcodeDetector` + `getUserMedia`，零依赖）。
3. 3180（或中继）表单登录后返回本目录的 `index.html`。`/api/*` 和 WebSocket 仍转到本机 `127.0.0.1:3080`。Git / 文件走 `/__remote__/shell/*` 白名单（cookie 通道）。
4. 开发时：`npm test` 会跑 `mobile/web/**/*.test.js`。

应用内扫码的降级（如实呈现，不 vendor 第三方解码库）：

- LAN `http://192.168.x.x:3180` 不是 secure context，取不到相机——按钮不渲染，提示用系统相机扫码或粘贴链接。应用内扫码主场景是 HTTPS 中继页。
- iOS Safari / Firefox 没有 `BarcodeDetector`——同样降级为粘贴。
- 相机权限被拒（`NotAllowedError`）→ 权限说明屏，指引浏览器站点设置，可改用粘贴。
- 扫到异 origin 的配对码（例如在中继页扫了 LAN 码）→ `location.replace` 整页跳转，token 留在 `#offer=`，不进查询串。

中继必须是 HTTPS。流量会经过中继运营方；这不是会话内容的端到端加密。

## Android

工程在 `android/`（`applicationId` `ai.deepseek.harness.mobile`，`minSdk` 26）。CameraX 扫同一条二维码，JSON 登录拿设备令牌，存在 Keystore。画面按 `docs/superpowers/mocks/2026-08-23-android-phone.html`。不要用 WebView 套官方 UI 或该 HTML。

本机需 Android SDK。当前工程 `compileSdk`/`targetSdk` 为 36。

```text
cd android
gradlew.bat :protocol:test
gradlew.bat :app:assembleDebug
```

协议与 Host/Git JSON 编解码在 `:protocol`，不需要模拟器。Compose 壳在 `:app`，需要 Android SDK。
