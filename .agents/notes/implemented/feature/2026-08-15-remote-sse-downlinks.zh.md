# Agent Note: 非回环浏览器使用 SSE 下行

Status: implemented

[English](2026-08-15-remote-sse-downlinks.md) | 中文

## 问题

手机远程经桌面 HTTP 反向代理加载官方网页。`WorkspaceRuntime` 只在 `ConnectionController` 标为已连接之后才拉 `session.list`。控制器原先在 `host.describe` 之前就打开 `events.mux` 与 `events.host`。两条长连接 HTTP 下行会占满手机浏览器每个来源的 HTTP/1.1 连接槽，`host.describe` 因此无法发出，`onConnected` 从不触发，侧栏保持空白，即使同一源上的 unary POST 已经能返回 Host 上的对话。会话历史也是 unary（`session.history`）；列表握手没完成时它也不会跑。Host 存储并不是空的：对回环和对带设备 cookie 的中继直接调 `session.list` 都能返回在线行。

## 决策

`ConnectionController` 先完成 `host.describe` 并触发 `onConnected`，然后再打开任一条事件下行，因此 `session.list` 与 `session.history` 走已经通的 HTTP 路径。控制器会等待 `onConnected` 返回的 Promise，再发起 WebSocket upgrade，这样这些 unary 调用以及尚未完成的插件包拉取不会排在两条 CONNECTING 的 socket 后面。运行时的 `onConnected` 先等待 `session.list` 与 `workspace.list`（以及已打开窗口的 resync），再发出 `connection/reset`。`WebApiClient` 在每个源上（包括经中继的手机）都用 WebSocket 打开 `events.mux` 与 `events.host`。中继在设备 cookie 存在时转发 upgrade（已认证的 `GET /api/events.host` 返回 101）。手机载体不是两条 HTTP SSE GET：它们会再次占满连接槽，把 Host 列表藏起来。未带 `Accept: text/event-stream` 的普通网络 GET 仍返回 426；进程内 `AbstractApiClient.readSse` 仍用该 Accept 供测试使用。

## 考虑过的替代

**把手机空白当成当前会话恢复失败。** 否决：Host 列表根本没到达。`session.list` 没跑时，打开最近一行也没用。

**非回环改开两条 SSE GET 而不用 WebSocket。** 否决：对中继的实测表明已认证 WebSocket upgrade 能成功。SSE 与 `host.describe`／`session.list`／`session.history` 争用同一 HTTP/1.1 连接池；连接槽少的手机浏览器就会看不到对话。

**等两条流的 onOpen 之后才 onConnected。** 否决：卡住的下行会把 unary 存储藏起来。连接之后的实时帧仍需要下行流；列表和历史不需要。

## 后果

桌面 Electron 除了在 describe 之后、且等 `onConnected` 结算后再打开下行外不变。手机远程在 `host.describe` 成功且列表 RPC 返回后灌入 Host 对话列表，然后再 upgrade 两条 WebSocket 接收实时帧。在插件启动期间或与 `session.list` 并行打开这些 socket，会占满手机的 HTTP/1.1 连接池，剩余插件包永远加载不完（启动转圈不会结束）。测试钉住「先 describe 再打开下行」、`onConnected` Promise 完成后再打开下行，以及非回环 `ws://` URL。
