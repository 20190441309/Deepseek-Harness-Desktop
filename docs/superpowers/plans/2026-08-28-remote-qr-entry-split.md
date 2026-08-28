# Remote 扫码入口分流：App＝链接设备，浏览器＝web 端

Touching: `remote-settings` + `mobile-remote`（2026-08-28）

## 产品意图（用户原话大意）

「扫码链接手机端或者 web 端怎么说，我希望如果是 Android APP 扫码是链接设备，浏览器等其他设备扫码出 web 端。」

## 现状调查结论

**配对 URL / QR 内容**：只有一张码——`http://<preferredLanIp>:3180/#offer=<offer-v2>`（`generateLocalPairingOffer` → `encodeOfferToFragmentUrl`，`appBaseUrl` 固定为本机 mobile/web `:3180`，永不指中继 origin）。

**两条入口今天的真实行为（功能上已经分流）**：

| 扫码方 | 路径 | 结果 |
| --- | --- | --- |
| 手机相机 / 浏览器 | 打开 `:3180` SPA，`app.js` 启动块 `hasOfferFragment(location.hash)` → 自动 `connect()` 配对 | 直接进入 **web 端**（完整 mobile web 客户端，sticky 存浏览器 localStorage） |
| Android App 内扫码 | `classifyScan` 提取完整 offer URL → APK 内置同一 SPA（WebViewAssetLoader 安全 origin）配对 | **链接设备**（sticky 存 App 的 WebView origin，冷启动不再依赖 LAN 落地页） |

**上游对照（生产做法）**：上游 chisacode 同样是**一张码**，`appBaseUrl` 默认 `https://app.chisacode.sh`（托管 web app）；vendored 代码里 `chisacode://` 仅是桌面 Electron 的 app 协议，**没有**移动端 deep link / Universal Link。原生端拿 offer 的方式就是 App 内扫码（与本仓库 `mobile/android` 一致）。所以「一码、web 落地、App 自带扫码」就是上游形状——不需要第二张码或第二套协议。

**缺口（本轮要修的）**：

1. **没人告诉用户这个分流**。桌面弹窗只有 QR + 配对链接；`:3180` 落地页文案只说「扫桌面的二维码」。用户无法知道「App 内扫码＝链接设备、相机/浏览器扫码＝web 端」。
2. Android **系统相机**扫码永远进浏览器（web 端）：`mobile/android` manifest 没有任何 `VIEW` intent filter / 自定义 scheme，无法把 `http://<LAN>:3180/#offer=` 交给 App。且 intent filter 无法匹配 fragment，host 是动态 LAN IP，只能靠 `android:host="*"` + `android:port="3180"` 这类宽匹配——属于 App 侧改动，本 VM 无 Android SDK 无法构建验证（卡片既有 BLOCKED 记录），**本轮 defer**。

## 决策

- **保持一张 QR**（对齐上游；不发明第二套协议、不出第二张码）。
- 分流靠**现有双入口 + 明确文案**：
  - 桌面弹窗 QR 下新增一行分流说明（`scanSplitHint`）。
  - 设置 → 远程 `intro` 补一句同样口径。
  - `:3180` 落地页 lead 下新增静态分流说明行（浏览器打开本页＝web 端；装了 App 就在 App 内扫码＝链接设备）。
- 口径统一为：**「Android App 内扫码＝链接设备；手机相机 / 浏览器扫码＝打开 web 端」**。

## 变更清单

1. `ui-settings-remote`：`locales.ts` 新增 `scanSplitHint`（zh/en，en 键齐全由 `satisfies Record<RemoteLocaleKey>` 编译期锁）；`RemoteSection.tsx` 在 QR 与配对链接下渲染该行；`intro` 文案补分流口径。spec 断言 QR 展示时分流说明可见。
2. `mobile/web/index.html`：connect 屏 lead 下新增 `#entry-split-hint` 静态说明行。
3. 新增 `mobile/web/landing.test.js`：断言落地页含分流说明、`#offer=` 自动连入 web 端的启动接线仍在（tripwire，防止有人把浏览器路径改成「仅设备配对」）。
4. 卡片同步：`remote-settings`（弹窗文案 gate / last verified）、`mobile-remote`（不变式：一码两入口 + 文案义务；last verified）。

## 风险与回滚

- 全部为文案 + 只读断言，零行为改动；回滚 = revert 对应 commit。
- 不改 QR 内容、不改 offer 协议、不改 `:3180` 自动配对行为（mobile-remote QA 48 检查依赖它）。

## Defer（App 侧依赖，写进下一步建议）

- Android manifest `VIEW` intent filter（`http` + `android:host="*"` + `android:port="3180"`）+ `MainActivity` 从 intent data 提取 fragment offer → 复用现有扫码 handoff：让**系统相机**扫码时 Android 弹「用 App 打开」，选 App＝链接设备、选浏览器＝web 端，把分流从「口径」升级为「系统级选择」。需要 Android SDK 构建 + 真机验证（本 VM BLOCKED）。
- 若未来上游给移动端引入正式 scheme / App Link，跟随上游，不自造。

## Gates

| Kind | What |
| --- | --- |
| Automated | `remote-section.client.spec.tsx`（分流说明随 QR 可见）；`mobile/web/landing.test.js`（落地页口径 + 浏览器 web 端自动连入 tripwire）；locale 键齐全编译期锁 |
| Manual | 浏览器扫码 → 进 web 端且落地页可见分流说明；Android App 内扫码 → 链接设备；桌面弹窗可见分流说明 |
