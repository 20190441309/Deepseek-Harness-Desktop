# 手机远程客户端

中文 · 和桌面端同一套官方 Web UI，不重做聊天页。

## Web

用系统相机扫桌面端侧栏 **手机按钮** 弹出的二维码，或把配对链接贴进手机浏览器。官方页在 768px 以下走手机布局。密钥在 `#offer=` 里，不是查询串。

本目录的 `npm run web` 也可以贴同一条链接，然后跳进官方页。

## Android

```powershell
cd mobile
npm install
npx expo start
```

用 Expo Go 扫终端里的码，或 `npx expo run:android` 打调试包。局域网是 `http://`，`app.json` 已打开 `usesCleartextTraffic`。

把手机弹窗二维码对应的 `http://<局域网IP>:3180/#offer=...` 贴进连接页。第一次会写 Cookie，之后同一 WebView 不用再带令牌。中继模式下贴中继源上的同一条 `#offer=` 链接。

电脑和手机需要能互相访问：局域网要同一 Wi-Fi；中继则走桌面出站连接。
