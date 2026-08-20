# Agent Note: 壁纸图库与裁剪

Status: implemented

[English](2026-08-18-wallpaper-gallery-and-crop.md) | 中文

## 问题

外观页把可选背景图存成 data URL，并提供毛玻璃和像素化滑杆。本地选图在绘制时靠 CSS `object-fit: cover` 覆盖裁切，用户无法选择留下哪一块，应用内也没有图库。需要密钥、热链原图或 HTML 画廊页的第三方壁纸 API，对不上现有 Host data URL 上限，也不符合桌面拉取规则。

## 决策

**图库主源是用户配置的 HTTPS JSON 目录。** `wallpaperCatalogUrls` 写在 Host `ui-theme`，最多八条互不相同的 `https:` 字符串，每条最多 500 字符——不是桌面 `config.json`，也不和插件市场混用。`wallpaperBingEnabled` 默认 false。渲染层每次打开图库带上该列表；主进程不持久化它。目录 JSON 要么是必应 `images[]`，要么是 `{ version, items: [{ id, title, thumbUrl, imageUrl, copyright? }] }`。拉取时只允许 HTTPS，测试可用 `DSHD_WALLPAPER_ALLOW_HTTP=1` 打到 fixture。上限：JSON 4MB、每源 500 条、原图 12MB、手工跟随最多四次重定向并复核 `Location`、不带 cookie。没有 `Content-Length` 的响应按块读取，超过字节上限即中止。缩略图可用 `<img src>`；裁剪用的全图必须经 `downloadWallpaper` 变成 data URL。

**必应 HPImageArchive 是可选的网络图源，不是内置图包。** 外观页开关打开时，桌面主进程拉取两页 HPImageArchive：`idx=0&n=8` 与 `idx=8&n=8`，地址为 `https://cn.bing.com/HPImageArchive.aspx?format=js&mkt=zh-CN`（测试用 `DSHD_BING_WALLPAPER_URL` 覆盖；`{idx}` 会展开成两页）。`wp === false` 的条目丢弃。全图用 `{origin}{urlbase}_1920x1080.jpg`，缩略图 `_400x240.jpg`。不拉 UHD：壁纸 data URL 已接近 1.8MB 上限，长边压在 1920。外观页写明必应目录仅限壁纸用途。

**每条持久化路径都按当前窗口比例裁剪。** 本地选图和图库选图打开同一个裁剪对话框（平移、滚轮／滑杆缩放，遮罩锁定为 `window.innerWidth / innerHeight`）。确认按钮在预览 `load` 给出自然尺寸之前保持禁用；窗口 `resize` 会更新遮罩。确认后经 `cropWallpaper` 烘焙 JPEG，再走 `setWallpaper`；裁剪失败（包括解码在 `CROP_DECODE_TIMEOUT_MS` 内一直不结束）时对话框留下，不写入未裁原图。裁剪进行中关闭对话框不写入。`dismiss` 会同步抬高裁剪会话令牌，即使此时 `open` 尚未翻转。裁剪预览在 `image` 为空时不渲染 `<img>`，因此 Presence 退出不会去拉取 `src=""`。关闭图库会抬高下载会话令牌；随后完成的 `downloadWallpaper` 不会打开裁剪。本地选图超过 `MAX_WALLPAPER_FILE_BYTES`（12MB，与主图拉取相同）时，在 `FileReader` 之前就被拒绝。图库缩略图使用 `referrerPolicy="no-referrer"`；仍以 `<img src>` 加载（不用 `crossOrigin`）。图库下载失败留在图库并显示下载错误。本地文件不是可读图片时，行上显示选图失败文案。添加一条会被 `sanitizeWallpaperCatalogUrls` 丢掉的目录 URL（非 `https:`、重复、过长）会留下草稿并显示目录拒绝文案。已设壁纸可通过外观「调整背景图」从已存 data URL 再裁一次。`apply` 仅在 `window.shell` 同时暴露 `listWallpaperCatalog` 与 `downloadWallpaper` 时注入二者；普通 `dsh web` 只保留本地选图和裁剪，不显示图库和图源编辑。

这是对[主题家族外观系统](2026-08-14-theme-family-appearance-system.md)里 Appearance 附加项的延伸。两个新字段与其他 Appearance 附加项同写 Host `ui-theme` 分节（[Host settings 支撑的偏好](../bug-fix/2026-08-06-host-backed-web-preferences.md)）。烘焙出的 JPEG 仍遵守[画布实心度与 data URL 上限](../bug-fix/2026-08-15-appearance-nav-contrast-and-wallpaper-canvas-cap.md)。

## 曾考虑的替代方案

**把 Unsplash／Pexels 等做成内置源。** 否决：壁纸应用条款不允许这种用法，且那些 API 要求热链原图，而不是烘焙 data URL。

**抓包 360 壁纸接口或多年版必应 GitHub 归档。** 否决：非官方、易碎，且超出官方 HPImageArchive 约定。

**HTML 画廊页或带账号／cookie／点数的合作壁纸 API。** 否决：目录解析只认上面两种 JSON，拉取不带 cookie，原图必须变成 data URL，不能依赖第三方付费墙。

**把目录 `imageUrl` 热链成壁纸层。** 否决：Host 文档已经按带上限的 data URL 存储；活的远程 URL 会污染 canvas CORS、离线失效，并跳过裁剪烘焙。

**再开一个 Electron 窗口，或放进插件市场设置页。** 否决：产品面是 Appearance `settings.section`（`id: appearance`），只用 `ui-primitives` 和 `--dsw-alias-*`。

## 后果

桌面外观页可以列出最多八个自定义 JSON 目录，并在保存前裁剪。仅当 `wallpaperBingEnabled` 为 true 时才查询必应。`dsh web` 不拉目录。某条目录 URL 失败时只警告该源，其它源照常。没有搜索、分类、每日自动换图、收藏夹和成人源。

## 测试

桌面 wallpaper-catalog 测试钉住未设 `includeBing: true` 时不拉必应、必应 `wp:false` 丢弃、两页 `{idx}` 合并、原生 `items` 含 500 条上限、4MB 以下 JSON 保留、分块传输超过 4MB 即中止、非法 URL、重定向跳数上限，以及单源失败不拖垮其它源。`appearance-section.client.spec.tsx` 钉住本地选图 → 裁剪 → `setWallpaper` 写入 `cropWallpaper` 的返回值、取消本地选图裁剪不写入、外观「调整背景图」从已存 data URL 再打开裁剪、裁剪进行中取消不写入、裁剪关闭后没有空的 `img[src=""]`、超过 `MAX_WALLPAPER_FILE_BYTES` 的本地 File 在 `FileReader` 之前被拒绝、图库关闭后完成的下载不打开裁剪、裁剪失败不写入原图、「使用」在预览 load 前禁用、resize 后按当前窗口比例再烘焙、无 shell 时隐藏图库、必应条目加裁剪写入、目录 URL 编辑、拒绝 `http:` 目录 URL 的文案、下载失败文案、拉取失败文案，以及本地选图失败文案。`wallpaper-crop-modal.client.spec.tsx` 钉住 `open` 仍为 true 时取消也不会确认。`wallpaper.client.spec.ts` 钉住裁剪矩形数学、JPEG `toDataURL('image/jpeg')` 导出，以及解码挂起时在 `CROP_DECODE_TIMEOUT_MS` 后返回 null。`theme.client.spec.ts` 钉住 Host 分节省略 `wallpaperBingEnabled` 时保持关闭。`apply.client.spec.ts` 钉住桌面 shell 同时注入两个目录回调。

## 相关

- [主题家族外观系统](2026-08-14-theme-family-appearance-system.md)
- [Host settings 支撑的 Web 偏好](../bug-fix/2026-08-06-host-backed-web-preferences.md)
- [外观导航对比度与壁纸画布上限](../bug-fix/2026-08-15-appearance-nav-contrast-and-wallpaper-canvas-cap.md)
