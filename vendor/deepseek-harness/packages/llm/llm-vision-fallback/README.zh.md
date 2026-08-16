# @deepseek-ai/dsh-llm-vision-fallback
[English](README.md) | 中文

由用户指定的视觉模型为图片附件生成描述，使纯文本主模型（例如 DeepSeek）也能处理这些图片。

模型设置页把指定路由保存在 `vision-fallback` 设置命名空间（`provider` + `model`；两者皆缺省即关闭该功能）。apiproxy 准入门在 `ctx.visionFallback.configured()` 为真时，为纯文本主模型放行带图请求；agent 循环在每次派发请求前调用 `ctx.visionFallback.rewriteMessages()`：目的地模型的 `inputModalities` 不含 `'image'` 时，图片块会被替换为由指定视觉模型一次性生成的描述文本。`read_image` 工具的路由门（[`@deepseek-ai/dsh-tool-fs`](../../fs/tool-fs)）同样在服务已配置时为纯文本路由放行，工具读入的图片因此走同一套替换。

每条生成的描述都会在主请求派发前以 `vision/describe` 事件追加进会话日志，因此改写后的请求可从日志完整重建，后续步骤会复用已记录的描述而不是重复描述。

## 配置

- `maxOutputTokens` — 视觉调用的输出 token 上限。
- `timeoutMs` — 视觉调用的端到端超时（毫秒）。

## 模型体验

纯文本路由上主模型永远看不到原始图片字节；它看到的是以 `【图片…】…【图片描述结束】` 包裹的文本块（代替每张图片），其中包含视觉模型的描述。指定视觉模型对每张新图片收到一次辅助请求（固定中文系统提示，要求忠实转录与版面描述）。每张附件每个会话只生成一次描述，之后从日志回放，因此 token 成本为每张图片一次辅助调用，加上此后每次主请求携带的描述文本。

## 已知限制与后续工作

- 描述是整体替换的；除 `maxOutputTokens` 外没有按图片的大小上限。
- 视觉调用失败会让主请求显式失败，而不是降级为占位文本。
- 设置界面把所有已配置模型都列为候选；浏览器模型目录尚未携带 `inputModalities`，因此还无法过滤出具备视觉能力的路由。
