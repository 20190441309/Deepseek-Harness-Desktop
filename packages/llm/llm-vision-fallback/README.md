# @deepseek-ai/dsh-llm-vision-fallback

A user-designated vision-capable model describes image attachments so a text-only main model (e.g. DeepSeek) can act on them.

The Models settings page stores the designated route in the `vision-fallback` settings namespace (`provider` + `model`; both absent disables the feature). The apiproxy admission gate admits image prompts for text-only main models whenever `ctx.visionFallback.configured()` is true, and the agent loop calls `ctx.visionFallback.rewriteMessages()` before dispatching each request: image blocks bound for a model whose `inputModalities` excludes `'image'` are replaced with description text generated once by the designated vision model. The `read_image` tool's route gate ([`@deepseek-ai/dsh-tool-fs`](../../fs/tool-fs)) likewise admits text-only routes while the service is configured, so tool-read images flow through the same substitution.

Each generated description is appended to the session log as a `vision/describe` event before the main request dispatches, so rewritten requests remain reconstructable from the log and later steps reuse logged descriptions instead of re-describing.

## Config

- `maxOutputTokens` — vision-call output-token cap.
- `timeoutMs` — end-to-end vision-call deadline in milliseconds.

## Model Experience

The main model never sees raw image bytes on a text-only route; it sees `【图片…】…【图片描述结束】` framed text blocks in place of each image, containing the vision model's description. The designated vision model receives one auxiliary request per new image (fixed Chinese system prompt demanding faithful transcription and layout description). Descriptions are generated once per attachment per session and replayed from the log afterwards, so token cost is one auxiliary call per image plus the description text carried in every subsequent main request.

## Known Limitations and Deferred Work

- Descriptions are substituted whole; there is no per-image size cap beyond `maxOutputTokens`.
- A failed vision call fails the main request loudly instead of degrading to a placeholder.
- The settings UI offers every configured model as a candidate; it cannot yet filter to vision-capable routes because the browser model catalog does not carry `inputModalities`.
