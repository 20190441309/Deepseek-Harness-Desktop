# 模块：Preload 与 IPC

## 职责与非目标

**职责：** 按角色暴露 `window.shell`；main 鉴权与路由。  
**非目标：** 不把任意 Node API 直接暴露给页面。

## 用户路径

用户无感知；产品能力都经此桥（浏览壁纸、Git、PTY、市场安装等）。

## 架构要点

- Preload：`src/preload/index.js` — **boot** API 子集 vs **harness** 全量桌面 API。  
- Main：`ipc.js` + `ipc-authorization.js` 校验 sender。  
- 完整方法表：[../appendix/shell-api.md](../appendix/shell-api.md)

```mermaid
flowchart LR
  page[Renderer_or_BV]
  preload[preload_shell]
  ipc[ipc.js]
  page --> preload --> ipc
```

## 实现入口

- `src/preload/index.js`
- `src/main/ipc.js`、`ipc-authorization.js`

## 不变量

- Boot 页不得调用仅 harness 的破坏性 API。  
- FS / Git / 打开路径必须落在工作区权威之内。

## 门槛

- 桌面单测：`src/preload/shell-api.test.js`、`ipc-authorization` 相关测试  
- QA：各能力条隐含依赖本桥可用

## 延伸阅读

- [workspace-fs.md](workspace-fs.md)、[blueprint.md](../blueprint.md)
