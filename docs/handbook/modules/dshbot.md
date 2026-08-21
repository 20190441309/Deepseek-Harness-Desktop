# 模块：dshbot

## 职责与非目标

**职责：** 预置 bot 联系人 / 群房间能力（侧栏等），随应用打包。  
**非目标：** 不做成独立聊天产品壳；不扩散非官方视觉。

## 用户路径

- 安装后侧栏可见 bot 相关入口（以当前 UI 为准）。  
- 设置 / 扩展区应能感知预置存在（`TC-EXT-007`）。

## 架构要点

- `dshbot-preset.js` 写入 profile；源在 `vendor/dshbot`。

## 实现入口

- `src/main/dshbot-preset.js`、相关 catalog/avatar 测试旁路文件
- `vendor/dshbot/`

## 不变量

- 预置随桌面交付；勿在文档承诺未实现的独立窗。

## 门槛

- QA：`TC-EXT-007`

## 延伸阅读

- [../superpowers/specs/2026-08-19-dshbot-design.md](../../superpowers/specs/2026-08-19-dshbot-design.md)
