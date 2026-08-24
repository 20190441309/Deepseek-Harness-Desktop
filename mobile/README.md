# 手机远程

中文 · 扫桌面 **远程** 弹窗里的二维码。密钥只在 `#offer=`。浏览器打开 `mobile/web` 独立 SPA；Android 打开 `mobile/android` Kotlin Compose 应用。都不是官方四栏 `dsh web`。

## Web

1. 桌面打开远程，选局域网或 HTTPS 中继。
2. 系统相机 / 浏览器扫码。
3. 3180（或中继）表单登录后返回本目录的 `index.html`。`/api/*` 和 WebSocket 仍转到本机 `127.0.0.1:3080`。
4. 开发时：`npm test` 会跑 `mobile/web/**/*.test.js`。

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
