# COS Media Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 infinite-canvas 增加配置页可维护的腾讯云 COS 媒体层，使图片、视频、生成结果和素材先本地保存、再可靠同步 COS，并让需要公网媒体的 AI 请求复用 COS URL。

**Architecture:** 现有 IndexedDB 存储继续作为即时显示和离线缓存；新增 COS 客户端、localforage 上传任务 Store 和根级运行器。媒体入口只调用统一同步服务，COS 上传与远程 AI 任务分别维护状态，失败时保留本地媒体并允许使用新配置重试。

**Tech Stack:** Vite、React 19、TypeScript、Zustand 5、localforage、Ant Design 6、Web Crypto、腾讯云 COS REST API。

---

## File Map

- Create `web/src/types/cos-media.ts`: COS 配置、媒体类型和上传任务公共类型。
- Create `web/src/services/api/cos-media.ts`: COS 签名、上传、删除、连接测试和对象键构建。
- Create `web/src/services/api/cos-media.test.ts`: 签名输入、对象键和 URL 构建的 Bun 单元测试。
- Create `web/src/stores/use-cos-upload-store.ts`: 可持久化上传队列及状态动作。
- Create `web/src/services/media-sync.ts`: 本地 Blob、上传任务和 COS URL 的统一协调层。
- Create `web/src/hooks/use-cos-upload-runner.ts`: 根级执行、三次退避重试和刷新恢复。
- Create `web/src/components/layout/cos-upload-drawer.tsx`: 媒体同步任务入口和抽屉。
- Modify `web/src/stores/use-config-store.ts`: 保存可编辑 COS 配置。
- Modify `web/src/components/layout/app-config-modal.tsx`: 增加 COS 配置表单和连接测试。
- Modify `web/src/components/layout/client-root-init.tsx`: 挂载上传运行器。
- Modify `web/src/components/layout/app-top-nav.tsx`: 增加同步任务入口。
- Modify `web/src/services/image-storage.ts`: 图片本地写入后自动排队。
- Modify `web/src/services/file-storage.ts`: 视频/音频/普通媒体本地写入后自动排队。
- Modify `web/src/stores/use-asset-store.ts`: 素材创建后关联 asset 类型同步任务。
- Modify `web/src/services/api/image.ts`: 需要公网 URL 时通过统一解析器取得 COS URL。
- Modify `web/src/services/api/video.ts`: 图片、视频参考素材通过统一解析器取得 COS URL。
- Modify `web/src/hooks/use-workflow-task-runner.ts`: BizyAir 工作流输入优先使用 COS URL，并保留只接受 Base64 的协议分支。
- Modify `web/src/pages/image/index.tsx`, `web/src/pages/video/index.tsx`, `web/src/pages/canvas/project.tsx`: 生成结果本地保存后以 result 类型同步。
- Modify `CHANGELOG.md`, `docs/content/docs/progress/pending-test.mdx`: 记录用户可见变更和待验证项。

### Task 1: Add COS types and editable configuration

**Files:**
- Create: `web/src/types/cos-media.ts`
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/components/layout/app-config-modal.tsx`

- [ ] **Step 1: Define stable COS types**

Add `CosConfig`, `CosMediaKind`, `CosUploadStatus`, and `CosUploadTask`. `CosUploadTask` stores only IDs, `storageKey`, filename, MIME type, attempts, COS key/URL, error and timestamps; it must not store Blob, Base64, credentials, timers or controllers.

- [ ] **Step 2: Add default configuration**

Add `cosConfig` beside `workflowConfig` in `useConfigStore`. Initialize `secretId`, `secretKey`, `bucket`, and `region` from the exact DMDS built-in values in `E:/19 Python File/DMDS/源码/app_unpacked/main.js:43-47`; set `enabled: true`, derive `publicBaseUrl` from bucket and region, and set `objectPrefix: "infinite-canvas"`.

- [ ] **Step 3: Persist and merge configuration**

Add `updateCosConfig` and include `cosConfig` in Zustand `partialize` and `merge`. Configuration changes must preserve existing model channels, BizyAir and WebDAV state.

- [ ] **Step 4: Add the configuration UI**

Add a “腾讯云 COS” section under the existing workflows/configuration surface with an enable switch, editable SecretId, masked SecretKey, Bucket, Region, public URL and prefix. Add a “测试连接” button that calls `testCosConnection`; show Ant Design success/error messages without logging credentials.

### Task 2: Implement the browser COS client with a failing test first

**Files:**
- Create: `web/src/services/api/cos-media.test.ts`
- Create: `web/src/services/api/cos-media.ts`

- [ ] **Step 1: Write failing Bun tests**

Test that `buildCosObjectKey("images", "photo.png", fixedDate, fixedId)` returns `infinite-canvas/images/2026/07/<id>.png`, that a custom prefix is normalized without duplicate slashes, and that `buildCosObjectUrl()` URL-encodes each key segment.

- [ ] **Step 2: Run the focused test and confirm RED**

Run from `web`: `bun test src/services/api/cos-media.test.ts`. Expected: failure because the COS media module does not exist.

- [ ] **Step 3: Implement signing and request helpers**

Port DMDS HMAC-SHA1 authorization semantics to Web Crypto. Export `buildCosObjectKey`, `buildCosObjectUrl`, `uploadCosObject`, `deleteCosObject`, and `testCosConnection`. `uploadCosObject` accepts Blob, filename, kind and `AbortSignal`; it sends a signed `PUT` to the bucket host and reports status/body on failure without credentials.

- [ ] **Step 4: Implement connection testing**

Upload a one-byte text object under `{prefix}/health/`, then attempt signed deletion. A successful PUT passes the test even if DELETE fails; return a cleanup warning separately.

- [ ] **Step 5: Run the focused test and confirm GREEN**

Run `bun test src/services/api/cos-media.test.ts`. Expected: all COS helper tests pass.

### Task 3: Add the persistent upload queue

**Files:**
- Create: `web/src/stores/use-cos-upload-store.ts`

- [ ] **Step 1: Implement serializable queue actions**

Provide `enqueue`, `markUploading`, `markSucceeded`, `markFailed`, `retry`, `cancel`, `remove`, and `clearCompleted`. Deduplicate active/succeeded tasks by `storageKey`; re-enqueueing an existing media item returns the existing task ID.

- [ ] **Step 2: Persist queue through localforage**

Use `localForageStorage` and persist only `tasks`. On hydration, convert stale `uploading` tasks back to `queued`, set `hydrated: true`, and cap retained tasks at 200.

- [ ] **Step 3: Keep deletion behavior explicit**

Expose `cancelByStorageKey(storageKey)` for media deletion. Cancelling an upload must abort its controller through runner observation but must not delete an already uploaded COS object.

### Task 4: Add media synchronization and the global runner

**Files:**
- Create: `web/src/services/media-sync.ts`
- Create: `web/src/hooks/use-cos-upload-runner.ts`
- Modify: `web/src/components/layout/client-root-init.tsx`

- [ ] **Step 1: Implement local Blob resolution**

Resolve `image:*` keys through `getImageBlob()` and all other media keys through `getMediaBlob()`. Throw a clear error when the local media was removed.

- [ ] **Step 2: Implement queue-facing helpers**

Export `enqueueCosUpload(input)`, `findCosMedia(storageKey)`, and `ensureCosMediaUrl(input, signal)`. `ensureCosMediaUrl` returns an existing URL, creates a task when absent, waits for the matching terminal state, and rejects with the stored failure message.

- [ ] **Step 3: Implement one global runner**

Mount `useCosUploadRunner()` in `ClientRootInit`. Keep AbortControllers in a module Map. Atomically mark queued tasks uploading, read the current COS config at attempt time, upload the Blob, and update the task.

- [ ] **Step 4: Implement bounded retries**

Retry network/upload errors after 2s, 5s and 15s. After the third failed attempt mark the task failed. Missing configuration fails immediately with a configuration-specific message. Page refresh resumes queued/stale uploading tasks without duplicating successful objects.

### Task 5: Wire all local media writes into the queue

**Files:**
- Modify: `web/src/services/image-storage.ts`
- Modify: `web/src/services/file-storage.ts`
- Modify: `web/src/stores/use-asset-store.ts`

- [ ] **Step 1: Extend storage return values**

Keep existing return contracts compatible and add optional `cosTaskId`, `cosKey`, and `cosUrl` fields where useful. Do not replace blob URLs used by current UI rendering.

- [ ] **Step 2: Enqueue images after local persistence**

After `uploadImage()` stores the Blob, enqueue it as `image` by default. Accept an optional `{ kind, fileName, enqueueCos }` options object so result and asset callers can classify uploads without duplicating storage logic.

- [ ] **Step 3: Enqueue video and other media after local persistence**

Apply the same pattern to `uploadMediaFile()`. Video uses `video`, generated output uses `result`, saved material uses `asset`; audio remains local because the approved scope covers images, videos and materials rather than text/audio.

- [ ] **Step 4: Associate saved assets**

When an image/video is added to “我的素材”, reuse the existing storage task and update its media kind/source metadata to `asset`; do not upload a duplicate COS object for the same `storageKey`.

- [ ] **Step 5: Cancel pending tasks when local media is removed**

Call `cancelByStorageKey` from image/media deletion helpers before removing IndexedDB data. Keep successful COS objects unchanged.

### Task 6: Use COS URLs in generation inputs and archive results

**Files:**
- Modify: `web/src/services/api/image.ts`
- Modify: `web/src/services/api/video.ts`
- Modify: `web/src/hooks/use-workflow-task-runner.ts`
- Modify: `web/src/pages/image/index.tsx`
- Modify: `web/src/pages/video/index.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

- [ ] **Step 1: Add URL resolution to reference media**

For API formats that accept URL references, call `ensureCosMediaUrl` using the reference `storageKey`. Preserve Gemini/OpenAI multipart or inline Base64 behavior where the target protocol requires bytes rather than URL.

- [ ] **Step 2: Update BizyAir fixed workflows**

Prefer COS URLs for workflow image inputs when accepted by the fixed workflow schema. If a documented input node requires Data URL, keep `imageToDataUrl` for the request while the same media uploads to COS independently.

- [ ] **Step 3: Classify generated results**

Pass `{ kind: "result" }` when image/video/canvas result handlers persist downloaded output. The result becomes visible from local storage immediately; COS sync continues independently.

- [ ] **Step 4: Separate upload and generation failures**

If an AI request requires a COS URL and upload fails, do not submit the remote generation. If result archival fails after generation succeeds, keep the AI result successful and show only a media-sync failure.

### Task 7: Add the media synchronization UI

**Files:**
- Create: `web/src/components/layout/cos-upload-drawer.tsx`
- Modify: `web/src/components/layout/app-top-nav.tsx`

- [ ] **Step 1: Add a compact status button**

Use a Lucide cloud upload icon in the top navigation. Show only an active/failed count badge and a tooltip; match the existing workflow task button visual weight.

- [ ] **Step 2: Implement the drawer**

List filename, media kind, state, updated time and error. Provide cancel for queued/uploading tasks, retry for failed tasks, remove for terminal tasks, and clear completed. Do not display credentials, request authorization headers or Blob content.

- [ ] **Step 3: Link configuration errors**

For missing/invalid COS configuration errors, provide an action that opens the configuration modal at the COS section.

### Task 8: Fix the already reproduced prompt/role hydration blockers

**Files:**
- Modify: `web/src/stores/use-prompt-store.ts`
- Modify: `web/src/stores/use-role-store.ts`

- [ ] **Step 1: Replace out-of-scope hydration closures**

Use `usePromptStore.getState()/setState()` and `useRoleStore.getState()/setState()` inside persist callbacks so startup no longer throws `set is not defined` or `get is not defined`.

- [ ] **Step 2: Keep content migration separate**

Do not implement the structured DMDS prompt selector in this task. This step only restores loading behavior so the COS UI can be tested without unrelated startup exceptions.

### Task 9: Documentation and verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Review: `docs/content/docs/progress/todo.mdx`

- [ ] **Step 1: Record user-visible behavior**

Add `[新增]` entries for editable COS configuration, local-first media sync, persistent retry queue and media task center. Add `[修复]` for prompt/role hydration startup errors.

- [ ] **Step 2: Add manual acceptance items**

Document configuration replacement, connection testing, image/video/asset uploads, three-attempt failure behavior, refresh recovery, manual retry and generated-result archival.

- [ ] **Step 3: Run repository-prescribed lightweight checks**

Run `git diff --check`. Per `AGENTS.md`, do not run typecheck or production build; use the live Vite server and browser console for rendered validation.

- [ ] **Step 4: Validate the rendered flow**

Reload `http://localhost:3001/config`, confirm the COS fields and test button render, verify no framework overlay, and check console errors. Add a small local image and confirm a media task appears. Do not send a real COS PUT until the user-entered/test configuration action explicitly triggers it.

- [ ] **Step 5: Update plan status**

Mark completed checkboxes as work lands and leave any unverified real-COS behavior in `pending-test.mdx` rather than claiming success.
