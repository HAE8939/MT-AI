# 东木-AI 平台能力文档（自动生成缓存）

- 生成时间：2026-07-16，数据版本：2026-07-14
- Base URL: https://api.lk888.ai/api
- 认证：Header `Authorization: Bearer {API Key}`
- **API Key 存放位置**：项目根目录 `.env` 的 `API_KEY` 变量（SKILL.md 认证方式一节亦有备份）

## 接口总览

## 模型查询 (models)
- GET /v1/skills/models — 按类型查询平台所有可用模型。返回每个模型的名称、展示名称、类型、功能标签和简介。
- 不传 type 参数返回所有类型的模型
- type=chat 时只返回 gpt/o1/o3/chatgpt/claude/gemini 前缀的语言模型，并额外返回 api_format（调用格式：openai/anthropic/gemini）和 api_endpoint（对应的请求路径）
- type=image/video/audio 返回对应类型的媒体模型（TTS 语音合成、音乐均归类为 audio）

响应字段说明：
- name: 模型标识名，调用接口时传此值
- display_name: 展示用的中文名称
- type: 模型类型（chat/image/video/audio）
- tags: 功能标签数组，如["文生视频","图生视频"]
- description: 模型简介
- input_hint: 输入提示文案
- api_format: [仅chat] 调用格式，openai/anthropic/gemini
- api_endpoint: [仅chat] 对应请求路径，如 /v1/chat/completions
- GET /v1/skills/models/{model_name} — 查询单个模型的功能信息和参数列表，不含价格。

响应字段说明：
- name/display_name/type/tags/description: 同模型列表接口
- input_hint: 提示用户输入什么，如"描述视频内容"
- params: 参数定义数组，每个参数包含：
  - name: 参数标识名，调用时传入 params 对象的 key
  - label: 参数中文名称
  - type: 参数类型，select=下拉选择，textarea=文本输入，number=数字输入，upload=文件上传，switch=开关
  - required: 是否必填
  - default: 默认值
  - options: [仅select类型] 可选项数组，每项含 label(显示名)/value(传入值)/is_default
  - description: 参数说明

调用媒体生成接口时，将此处获取的参数放入请求体的 params 对象中。
- GET /v1/skills/models/{model_name}/pricing — 查询模型所有渠道分组的完整价格信息，包括参数价格变动。默认返回全量渠道分组，每个分组含 is_active 字段标识当前是否启用。注意：is_active=false 的分组并非永久关闭，平台会根据供应商状态随时启用或关闭渠道分组，因此展示价格时应包含所有分组供用户参考。传 ?status=active 可仅获取当前正在运行的分组。

## 调用说明 (calling)
- GET /v1/skills/guide — 返回平台所有模型的通用调用指南，包含以下内容：

1. 语言模型三种调用格式：
   - OpenAI 格式：POST /v1/chat/completions，适用于 gpt/o1/o3/chatgpt 前缀模型
   - Anthropic 格式：POST /v1/messages，适用于 claude 前缀模型
   - Gemini 格式：POST /v1beta/models/{model}:{action}，适用于 gemini 前缀模型
   每种格式含请求示例和响应示例

2. 媒体模型异步轮询流程：
   - 第一步：POST /v1/media/generate 提交任务，获取 task_id
   - 第二步：GET /v1/skills/task-status?task_id=xxx 轮询状态
   - 轮询间隔建议5秒，is_final=true 时停止

3. 价格计算公式：
   - 按次计费：最终价格 = 基础价格 × 参数系数 + 参数加价
   - 按token计费：费用 = 输入token数 × 输入单价 + 输出token数 × 输出单价

4. 渠道策略说明：
   - 价格优先：自动选择最便宜的可用渠道
   - 速度优先：自动选择响应最快的可用渠道
   - 成功率优先：自动选择成功率最高的可用渠道
   策略在用户的 API Key 设置中配置，调用时无需指定

## 任务管理 (task)
- GET /v1/skills/task-status — 查询媒体生成任务的实时状态。提交生成任务后，通过此接口轮询任务进度和结果。

响应字段说明：
- task_id: 任务ID
- model: 使用的模型名称
- status: 任务状态文本，如"排队中""生成中""生成完成""生成失败"
- status_group: 状态分组，"等待中"/"处理中"/"已完成"/"失败"
- progress: 进度百分比，如"0%"、50%"、"100%"
- is_final: 是否为终态。true 表示任务已结束（成功或失败），必须停止轮询
- result_url: 生成结果的下载地址，仅成功时有值
- result_type: 结果类型，video/image/audio 等
- cost: 实际扣费的算力值
- channel_group: 实际使用的渠道分组名称
- error: 失败时的错误信息
- created_at: 任务创建时间
- completed_at: 任务完成时间，未完成时为空
- duration_seconds: 从创建到完成的耗时（秒）

## 账户信息 (account)
- GET /v1/skills/balance — 查询当前 API Key 对应用户的算力余额和 Key 额度使用情况。

响应字段说明：
- balance: 用户账户的算力余额（注意：单位是算力，不是人民币）
- unit: 余额单位，固定为"算力"
- api_key_quota: API Key 的额度信息
  - used: 该 Key 已使用的算力
  - limit: 该 Key 的总额度上限，0 表示不限额
  - remaining: 该 Key 剩余可用额度，仅在 limit>0 时返回
- GET /v1/skills/usage — 查询最近 N 天本 API Key（或跨 Key 按账户）的算力消费。默认返回按模型聚合的汇总（调用次数/成功数/失败数/实际扣费/退款金额）；detail=1 返回按任务倒序的最近消费记录。失败但已退款的任务 cost 在响应里会处理为 0，refunded_amount 会单独给出，与 /v1/skills/task-status 一致。

## 反馈 (feedback)
- POST /v1/skills/feedback — AI 在使用平台接口过程中，遇到以下情况应主动提交反馈：1) 接口调用报错或返回异常，提交错误信息和调用参数便于平台定位修复；2) 文档说明不清晰或与实际行为不一致，帮助平台完善文档；3) 功能建议或缺少的能力，供平台开发团队参考。这是平台与AI之间的沟通桥梁，积极提交有助于平台持续改进。
- GET /v1/skills/feedback — 通过反馈ID查询之前提交的反馈的处理状态和结果

## 语言模型调用 (chat_api)
- POST /v1/chat/completions — 完全兼容 OpenAI Chat Completions API。可直接使用 OpenAI 官方 SDK，只需将 base_url 指向本平台即可。

适用模型：gpt/o1/o3/chatgpt 前缀的所有模型

主要参数：
- model: 模型名称（必填）
- messages: 消息数组，每条含 role(system/user/assistant) 和 content（必填）
- stream: 是否流式输出，true 为 SSE 流式，false 为一次性返回（默认false）
- temperature: 温度参数 0-2（可选）
- max_tokens: 最大输出 token 数（可选）

响应字段：
- choices[0].message.content: AI 回复内容
- usage.prompt_tokens: 输入消耗的 token 数
- usage.completion_tokens: 输出消耗的 token 数
- POST /v1/responses — 兼容 OpenAI 新版 Responses API 格式。相比 Chat Completions 更简洁，input 可直接传字符串。

适用模型：gpt/o1/o3/chatgpt 前缀的所有模型

主要参数：
- model: 模型名称（必填）
- input: 输入内容，可以是字符串或消息数组（必填）
- stream: 是否流式输出（可选）

响应字段：
- output[0].content[0].text: AI 回复内容
- usage.input_tokens: 输入 token 数
- usage.output_tokens: 输出 token 数
- POST /v1/messages — 完全兼容 Anthropic Messages API。可直接使用 Anthropic 官方 SDK，只需将 base_url 指向本平台。

适用模型：claude 前缀的所有模型

主要参数：
- model: 模型名称（必填）
- messages: 消息数组，每条含 role(user/assistant) 和 content（必填）
- max_tokens: 最大输出 token 数（必填，Anthropic 格式强制要求）
- system: 系统提示词，单独字段而非放在 messages 中（可选）
- stream: 是否流式输出（可选）

响应字段：
- content[0].text: AI 回复内容
- usage.input_tokens: 输入 token 数
- usage.output_tokens: 输出 token 数
- stop_reason: 停止原因，"end_turn" 表示正常结束
- POST /v1beta/models/{model}:{action} — 完全兼容 Google Gemini API。可直接使用 Google AI SDK，只需将 base_url 指向本平台。

适用模型：gemini 前缀的所有模型

URL 格式：/v1beta/models/{model}:{action}
- {model}: 模型名称，如 gemini-3-pro
- {action}: 操作类型
  - generateContent: 非流式，一次性返回完整结果
  - streamGenerateContent: 流式输出

主要参数：
- contents: 消息数组，每条含 role(user/model) 和 parts（必填）
  - parts 支持的类型：
    - {"text": "文本内容"}: 纯文本
    - {"inlineData": {"mimeType": "类型", "data": "base64编码"}}: 图片/视频/音频/PDF 等文件
- generationConfig: 生成配置，含 temperature/maxOutputTokens 等（可选）

支持的附件类型（通过 inlineData 传入）：
- 图片：image/jpeg, image/png, image/gif, image/webp
- 视频：video/mp4, video/webm, video/mov
- 音频：audio/mp3, audio/wav, audio/ogg, audio/flac
- 文档：application/pdf

响应字段：
- candidates[0].content.parts[0].text: AI 回复内容
- usageMetadata.promptTokenCount: 输入 token 数
- usageMetadata.candidatesTokenCount: 输出 token 数

## 媒体生成 (media_api)
- GET /v1/media/models — 返回所有可用的媒体生成模型及其参数定义。每个模型包含 name、type、label、description 和 params 字段。

params 定义了调用 /v1/media/generate 时可传的参数，包括名称、类型、选项、默认值等。

注意：建议使用 /v1/skills/models 接口替代，信息更完整（含功能标签、展示名称等）。
- POST /v1/media/generate — 提交图片/视频/音频/TTS/音乐生成任务。提交后返回 task_id，通过轮询接口查询结果。

请求体参数：
- model: 模型名称（必填），从 /v1/skills/models 获取
- prompt: 提示词/文本描述（必填）
- params: 参数对象（可选），从 /v1/skills/models/{name} 获取可用参数

params 用法说明：
- 先调用 /v1/skills/models/{model_name} 获取模型的 params 定义
- 将需要的参数组装为对象，key 是参数的 name，value 是参数值
- 例如模型有 duration 参数（type=select，options含"5"和"10"），则传 {"duration": "5"}
- type=select 的参数必须从 options 中选取 value 值
- type=upload 的参数传入文件的公网直链 URL；图片/音频也可直接传 data:<mime>;base64,<数据> 内联（单文件解码后≤10MB、单次合计≤30MB、请求体总≤50MB，视频仍需 URL）
- 未传的参数使用默认值

响应：
- data.任务id: 任务ID，用于轮询状态
- GET /v1/media/status — 查询媒体生成任务的实时状态（早期版本）。返回任务进度、结果地址、扣费等信息。

建议使用 /v1/skills/task-status 替代，增强版额外返回：
- model: 模型名称
- created_at: 创建时间
- completed_at: 完成时间
- duration_seconds: 耗时
- channel_group: 渠道分组名称
- GET /v1/skills/voices — 获取当前用户可用的 TTS 音色列表，支持按模型筛选
- POST /v1/skills/voices/clone — 上传音频文件克隆自定义音色，用于 speech-2.8 模型

## 人像形象 (avatar_api)
- POST /v1/skills/avatars — 上传一张人像图创建 SD2.0 人像形象（真人 real / 虚拟 virtual）。服务端会下载 image_url 并转存，后台异步素材化。真人形象返回扫码活体认证链接（120秒有效），必须由形象本人用手机打开完成人脸活体认证，无法绕过；虚拟形象无需认证。创建后轮询 GET /v1/skills/avatars/{avatar_id} 直到 status=ready，再在 /v1/media/generate 的 params.avatar_ids 里引用。
- GET /v1/skills/avatars — 列出当前账号的全部人像形象及其状态（awaiting_verification / processing / ready / failed），可按类型过滤。
- GET /v1/skills/avatars/{avatar_id} — 按 avatar_id 查询单个形象的状态，创建后用本接口轮询直到 status=ready。status=failed 时额外返回 failure_reason。
- POST /v1/skills/avatars/{avatar_id}/verification — 真人形象的活体认证链接 120 秒过期，过期后调本接口重新拉起认证会话并获取新链接。
- DELETE /v1/skills/avatars/{avatar_id} — 软删除指定形象（立即不可再被生成引用，宽限 7 天后物理清理母版与渠道侧素材）。


## 计费方式

- 单位为「算力」（非人民币）。按次计费：基础价格×参数系数+参数加价；按 token 计费：输入/输出分别计价。
- 每个模型价格经 GET /v1/skills/models/{name}/pricing 查询；渠道策略（价格/速度/成功率优先）在用户 Key 设置中配置。
- 调用付费接口前先查余额 GET /v1/skills/balance。

## 模型清单（92 个，按类型分组）

### chat（24 个）

| name | 展示名 | 标签 |
|---|---|---|
| claude-fable-5 | fable-5 | Coding, Deep thinking, Long context, Web search |
| claude-haiku-4-5-20251001 | claude-4-5 | Deep thinking, Coding, Web search |
| claude-opus-4-5-20251101 | opus-4-5 | Deep thinking, Coding, Web search |
| claude-opus-4-6 | opus-4-6 | Coding, Deep thinking, Long context, Web search |
| claude-opus-4-7 | opus-4-7 | Coding, Deep thinking, Long context, Web search |
| claude-opus-4-8 | opus-4-8 | Coding, Deep thinking, Long context, Web search |
| claude-sonnet-4-6 | sonnet-4-6 | Coding, Deep thinking, Long context, Web search |
| claude-sonnet-5 | sonnet-5 | Coding, Long context, Web search |
| gemini-3-flash-preview | Gemini 3 flash | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search, Fast, Hakimi |
| gemini-3-pro-preview | Gemini 3 Pro | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search, Hakimi |
| gemini-3.1-pro-preview | Gemini 3.1 Pro | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search, Hakimi |
| gemini-3.5-flash | Gemini 3.5 flash | 多轮对话, 多模态, 长上下文, 联网搜索, 极速, 哈基米 |
| gpt-4o | GPT-4o | Multi-turn chat, Multimodal, Long context, Web search |
| gpt-5.2 | GPT-5.2 Codex | Deep thinking, Coding, Web search, gpt |
| gpt-5.3-chat-latest | GPT-5.3 Chat | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search |
| gpt-5.4 | GPT-5.4 | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search |
| gpt-5.4-mini | GPT-5.4 mini | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search |
| gpt-5.4-nano | GPT-5.4 nano | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search |
| gpt-5.4-xhigh | GPT-5.4 Deep Reasoning | Multi-turn chat, Multimodal, Deep thinking, Long context, Web search |
| gpt-5.5 | GPT-5.5 | Multi-turn chat, Multimodal, Long context, Web search |
| gpt-5.5-medium | GPT-5.5 Medium Reasoning | Multi-turn chat, Multimodal, Long context, Web search |
| gpt-5.6-luna | GPT-5.6 luna | Multi-turn chat, Multimodal, Long context, Web search |
| gpt-5.6-sol | GPT-5.6 sol | Multi-turn chat, Multimodal, Long context, Web search |
| gpt-5.6-terra | GPT-5.6 terra | Multi-turn chat, Multimodal, Long context, Web search |

### image（16 个）

| name | 展示名 | 标签 |
|---|---|---|
| doubao-seedream-4-5-251128 | Seedream 4.5 | Text-to-image, Image-to-image |
| doubao-seedream-5-0-260128 | Seedream 5.0 | Text-to-image, Image-to-image, Multi-image fusion, Web-search image generation, 3k, Seedream |
| gemini-3-pro-image-preview | Nano Banana Pro | AI feature |
| gemini-3-pro-image-preview-guan | Banana Pro Official Relay | Text-to-image, Image-to-image, 4K, HD, Banana |
| gemini-3.1-flash-image-preview | Nano Banana 2 | AI feature |
| gemini-3.1-flash-image-preview-guan | Banana 2 Official Relay | Text-to-image, Image-to-image, 4K, HD, Banana |
| gpt-image-2 | GPT Image 2 | Text-to-image, Image-to-image |
| gpt-image-2-guan | GPT Image 2 Official | Text-to-image |
| kling-image-o1 | Kling o1 | Text-to-image, Image-to-image |
| kling-v3 | Kling-V3 | Text-to-image, Image-to-image, HD |
| kling-v3-omni | Kling-V3-Omni | Text-to-image, Image-to-image, Multi-image fusion, 4k, HD |
| mj_imagine | Midjourney | Text-to-image, Image-to-image |
| qwen-image | Qwen-image-max | Text-to-image, Image editing, Multi-image fusion |
| vidu-image-2 | VIDU Iamge 2 | AI feature |
| wan2.6-image | Wanxiang 2.6 Image | Text-to-image, Image-to-image |
| wan2.7-image | Wanxiang 2.7 Image | Text-to-image, Image-to-image |

### video（45 个）

| name | 展示名 | 标签 |
|---|---|---|
| doubao-seedance-1-5-pro-251215 | Seedream 3.5 Pro | Text-to-video, Image-to-video, First-frame reference, First/last frames, Video with audio, 1080p, HD |
| grok-imagine-video-1.5-preview | grok Imagine video1.5 | Image-to-video, First-frame reference, Built-in audio, 1-15s, HD |
| grok-video-3 | grok-video-3 | Text-to-video, Image-to-video, First-frame reference, 1080p, HD |
| hailuo-2.3 | Hailuo 2.3 | Text-to-video, Image-to-video, 1080p, HD |
| happyhorse-1.1-i2v | HappyHorse 1.1-First Frame | AI feature |
| happyhorse-1.1-r2v | HappyHorse 1.1-Reference-to-Video | AI feature |
| happyhorse-1.1-t2v | HappyHorse 1.1-Text-to-video | AI feature |
| happyhorse-i2v | HappyHorse-First Frame | AI feature |
| happyhorse-r2v | HappyHorse-Reference-to-Video | AI feature |
| happyhorse-t2v | HappyHorse-Text-to-video | AI feature |
| happyhorse-video-edit | HappyHorse-Video Editing | AI feature |
| kling-avatar-image2video | Kling-Digital Human | Digital Human, videoGenerate  |
| kling-motion-control | Kling-Motion Control | Motion Control, videoGenerate  |
| kling-motion-control-v3 | Kling-Motion Control V3 | Motion Control, videoGenerate , HD |
| kling-v2-6 | Kling 2.6 Pro | Text-to-video, Image-to-video, Video with audio, 1080p, HD |
| kling-v3-omni-cankao | Kling-Omni Reference-to-Video | Text-to-video, Image-to-video, Video with audio, Reference-to-Videovideo, HD |
| kling-v3-omni-shouweizhen | Kling-Omni First/Last Frames | Image-to-video, Video with audio, First/last frames, HD |
| kling-v3-omni-videoref | Kling-Omni Video Reference | Video Reference, Video Editing, HD |
| kling-v3-video | Kling-V3-video | Text-to-video, Image-to-video, Video with audio, First/last frames, HD |
| kwvideo-v2 | SD 2.0 First/Last Frames | Text-to-video, Image-to-video, Video with audio, First/last frames, Seedream, HD |
| kwvideo-v2-quannengcankao | SD 2.0 All-purpose Reference | AI feature |
| kwvideo-v2-ref | SD 2.0 Reference-to-Video | Text-to-video, Image-to-video, Video with audio, Reference-to-Videovideo, Seedream, 720p, HD |
| omni-flash | omni-flash | Text-to-video, Reference-to-video, Multi-image reference, Audio video, 6/8/10s, Google Gemini |
| omni_flash-10s | Omni Flash 10s | Text-to-video, Reference-to-video, Multi-image reference, With audio, 10s, 720P, Google Gemini |
| pixverse-c1-cankaosheng | Pix C1 Reference-to-Video | AI feature |
| pixverse-c1-shouweizhen | Pix C1 First/Last Frames | AI feature |
| pixverse-v5.6-r2v | Pix V5.6 Reference-to-Video | AI feature |
| pixverse-v5.6-shouweizhen | Pix V5.6 First/Last Frames | Text-to-video, Image-to-video, Video with audio, First/last frames, HD |
| pixverse-v6-shouweizhen | Pix V6 First/Last Frames | Text-to-video, Image-to-video, Video with audio, First/last frames, HD |
| sora-2 | Sora-2 Official | Text-to-video, Image-to-video, Stable |
| veo3.1 | veo3.1 | Text-to-video, Image-to-video, First-frame reference, First/last frames, HD |
| vidu-jieshuoman | VIDU-Narrated Comic | AI feature |
| vidu-mv | VIDU-Music MV | AI feature |
| viduq2-cankaosheng | Vidu Q2 Reference-to-Video | Reference-to-Videovideo, 1080p, HD, Video with audio |
| viduq3 | Vidu Q3 | Text-to-video, Image-to-video, First-frame reference, First/last frames, Video with audio, 1080p, HD |
| viduq3-cankaosheng | Vidu Q3 Reference-to-Video | AI feature |
| viduq3-drama | Vidu Q3 Drama | Reference-to-video, Drama, Multi-image reference, Voiced video, 1080p, HD |
| viduq3-turbo | Vidu Q3 Turbo | Image-to-Video, First-Last Frame, Audio Video, 1080p, HD |
| viduq3-turbo-cankaosheng | Vidu Q3 Turbo Reference-to-Video | Reference-to-Video, Text-to-Video, Multi-image Reference, Audio Video, 1080p, HD |
| wan2.2-animate-mix | Wanxiang-Video Face Swap | Video Face Swap |
| wan2.6-cankaosheng | Wanxiang 2.6 Reference-to-Video | Reference-to-Videovideo, 1080p, HD |
| wan2.6-shouzheng | Wanxiang 2.6 First Frame | Image-to-video, Text-to-video, Video with audio, 1080p, First-frame reference, HD |
| wan2.7-cankaosheng | Wanxiang 2.7 Reference-to-Video | Text-to-video, Reference-to-Videovideo, 1080p, HD |
| wan2.7-shouweizhen | Wanxiang 2.7 First/Last Frames | Image-to-video, First/last frames, 1080p, HD |
| wan2.7-xuxie | Wanxiang 2.7 Video Extension | AI feature |

### audio（7 个）

| name | 展示名 | 标签 |
|---|---|---|
| doubao-tts-2.0 | Doubao TTS 2.0 | Text-to-speech, Multiple voices, Multiple emotions, Multilingual |
| gemini-2.5-pro-preview-tts | Gemini-2.5-TTS | Text-to-speech, Multiple voices, Multilingual |
| gemini-3.1-flash-tts-preview | Gemini-3.1-TTS | Text-to-speech, Multiple voices, Multilingual |
| music-2.5 | Hailuo Music Generation 2.5 | Music generation, Lyrics generation, AI composition |
| music-2.5+ | Hailuo Music Generation 2.5+ | Music generation, Lyrics generation, AI composition, Instrumental music |
| speech-2.8 | Hailuo Voice Clone 2.8 | Voice cloning, Text-to-speech, Voice cloning, Multilingual |
| suno-v4.5 | Suno Music Generation 4.5 | Music generation, AI composition, Lyric continuation, Karaoke subtitles, Suno V4.5 |

## 媒体生成调用流程

1. GET /v1/skills/models/{name} 取参数定义（select/textarea/number/upload/switch）
2. POST /v1/media/generate {model, prompt, params} → 返回 task_id
3. GET /v1/skills/task-status?task_id=xxx 每 5 秒轮询，is_final=true 停止，成功取 result_url

文件入参：图片/音频可 base64 内联（≤10MB/文件），视频必须公网 URL。

## 语言模型调用

- OpenAI 格式 POST /v1/chat/completions（gpt/o1/o3/chatgpt 前缀）；亦支持 /v1/responses
- Anthropic 格式 POST /v1/messages（claude 前缀）
- Gemini 格式 POST /v1beta/models/{model}:generateContent（gemini 前缀）

## 特殊能力

- 人像形象 avatar：POST /v1/skills/avatars 建形象（真人需活体认证），ready 后在 params.avatar_ids 引用
- 音色克隆：POST /v1/skills/voices/clone（speech-2.8）
- 反馈通道：POST /v1/skills/feedback（文档疑问/接口报错/功能建议）
