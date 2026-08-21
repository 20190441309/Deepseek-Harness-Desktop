# 模块：启动与 Harness 生命周期

## 职责与非目标

**职责：** 拉起 / 监视 `dsh web`、boot 态机、就绪后露出 BrowserView、崩溃重启。  
**非目标：** 不实现对话业务；不扩散启动页仪器风到其它页。

## 用户路径

1. 冷启动见仪器画布与日志 → 插件进度 → 主界面。  
2. 失败：重试、导出日志、跳过用户插件。  
3. 运行中 Harness 挂掉：故障态与可选自动重启。

## 架构要点

- `HarnessController` 拥有子进程与揭示时机；boot 只消费事件。  
- 插件装载进度留在 boot，不切官方加载页。  
- 流程详述：[../flows/boot-to-ready.md](../flows/boot-to-ready.md)

## 实现入口

- `src/main/harness-controller.js`、`dsh.js`、`window.js`
- `src/renderer/boot.html` / `boot.js` / `boot.css` / `boot-tokens.css`

## 不变量

- Feature card：[../../features/boot-page.md](../../features/boot-page.md)
- 启动页 `--boot-*` 不得用于设置 / 官方 UI / 关闭遮罩。

## 门槛

- QA：`TC-INST-001` … `TC-INST-008`

## 延伸阅读

- [../design-language.md](../../design-language.md#桌面启动页)
- [plugin-recovery.md](plugin-recovery.md)
