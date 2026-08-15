# Deepseek Harness Remote (Android + Web)

Expo client for the desktop outbound relay. Same UI on Android and web: paste or scan a pairing URL, list sessions, send prompts, approve tools.

Web stores the device secret in `sessionStorage` (refresh requires pairing again). Android uses `expo-secure-store`.

## Web

From the repo root after `npm install` in this folder:

```powershell
cd apps/mobile
npm install
npm run web
```

Default port is `8081`, which matches the desktop `remoteAppBaseUrl` default. Open the pairing URL from Settings → 通用 → 远程访问, or paste the link on this page.

## Android (sideload)

```powershell
cd apps/mobile
npx expo run:android
```

Or install Expo Go, run `npm start`, and scan the Metro QR. Camera permission is used only to read the desktop pairing QR.

A release APK (when the Android SDK / EAS is available):

```powershell
npx eas build -p android --profile preview
```

## Pairing

1. Keep the desktop app online.
2. Settings → 通用 → 远程访问 → 开启.
3. Scan the QR or open the fragment URL. The offer stays after `#`, so the web server never logs the token.
