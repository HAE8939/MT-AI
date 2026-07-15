# DMDS Core Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 DMDS 中基座尚未覆盖或实现语义不同的 AI 绘画能力迁移到 infinite-canvas，同时保留现有 React 画布、生成服务、Zustand 状态和浏览器本地存储架构。

**Architecture:** 通用生图、视频、画布和素材库继续使用 infinite-canvas 的既有实现；只读图像工具以独立 Ant Design Modal 接入。图纸渲染、双相机多角度和 AI 超分通过隔离的 BizyAir 工作流适配器执行，并由 localforage 持久化任务 store 负责跨路由和刷新恢复。任务结果通过画布占位节点订阅写回，避免全局 store 与 `project.tsx` 局部节点状态互相覆盖。

**Tech Stack:** Vite、React 19、TypeScript、Ant Design 6、Tailwind CSS 4、Zustand 5、localforage、axios、Three.js。

**Implementation Status:** 已按计划完成代码与文档修改，等待用户执行开发环境和真实 API 验证。

---

## Confirmed Decisions

- 保留 infinite-canvas 的 DOM 无限画布，不迁移 DMDS `canvas-core.js`。
- 保留现有 OpenAI/Gemini 通用渠道；只为 DMDS 独有能力增加 BizyAir 固定工作流。
- 不增加项目后端，不将 `canvas-agent` 改造成通用代理，浏览器继续直连外部服务。
- 不迁移 DMDS 的 Electron IPC、本地代理、授权系统、COS 上传和本地文件路径。
- 不复制 DMDS 的命令式 DOM 代码；只提取交互规则、数学逻辑和请求协议后用 React/TypeScript 重写。
- 专业角色采用“画布角色工作流”，结果生成文本节点，不新增第二套聊天面板。
- 异步任务元数据使用 localforage 持久化，刷新后继续轮询。
- 双图对比作为第一项迁移；自由标注编辑器属于第二阶段增强，不阻塞核心迁移。
- 按项目规则，实施过程不执行语法检查、typecheck、build 或测试命令，由用户自行验证。

## Compatibility Assessment

| Area | DMDS | infinite-canvas | Decision |
| --- | --- | --- | --- |
| UI | 原生 HTML/CSS 和命令式 DOM | React、Ant Design、Tailwind | 所有 UI 重新实现，统一使用现有画布主题与 Ant Design Modal |
| State | `window` 全局对象、localStorage、IndexedDB | Zustand、localforage | 应用级状态进入 store；大媒体继续只保存 `storageKey` |
| Canvas | DOM 节点、CSS transform、SVG 血缘线 | DOM 节点、CSS transform、连接线 | 概念可映射，但不共享实现代码 |
| Requests | fetch、固定 Provider、本地代理回退 | axios/fetch、OpenAI/Gemini、浏览器直连 | 通用请求不改；BizyAir 使用独立 adapter |
| Long tasks | 全局数组和定时器 | 页面内请求引用 | 新增可持久化工作流任务层 |
| 3D | Three.js 运行时加载 | 当前无 Three.js | 安装依赖并动态导入，关闭时释放 WebGL 资源 |
| Files | Electron 本地路径、COS | Blob、IndexedDB、storageKey | 统一使用 `image-storage.ts` |

## Public Types and Interfaces

Create `web/src/types/ai-workflow.ts` with these stable interfaces:

```ts
export type AiWorkflowType = "drawing-render" | "multi-angle" | "upscale";
export type AiWorkflowStatus = "queued" | "submitting" | "polling" | "succeeded" | "failed" | "cancelled";

export type DrawingRenderParams = {
    template: "photography" | "custom";
    customPrompt: string;
    description: string;
    referenceNodeId?: string;
};

export type MultiAngleParams = {
    camera1: { horizontal: number; vertical: number; zoom: number };
    camera2: { horizontal: number; vertical: number; zoom: number };
};

export type UpscaleWorkflowParams = {
    targetResolution: 2048 | 4096;
};

export type AiWorkflowTask = {
    id: string;
    projectId: string;
    sourceNodeId: string;
    targetNodeIds: string[];
    type: AiWorkflowType;
    status: AiWorkflowStatus;
    externalTaskId?: string;
    params: DrawingRenderParams | MultiAngleParams | UpscaleWorkflowParams;
    resultUrls: string[];
    error?: string;
    createdAt: string;
    updatedAt: string;
};

export type BizyAirWorkflowConfig = {
    baseUrl: string;
    apiKey: string;
};
```

Add optional canvas metadata fields in `web/src/types/canvas.ts`:

```ts
workflowTaskId?: string;
workflowType?: AiWorkflowType;
workflowResultIndex?: number;
```

Task records must never contain API keys, base64 images, Blob objects, timer handles or AbortControllers.

## Module Alignment

| DMDS capability | Target implementation |
| --- | --- |
| 通用 AI 生图 | 继续使用 `web/src/services/api/image.ts` 和现有画布生成链路 |
| 无限画布 | 保留 `web/src/pages/canvas/project.tsx`、`web/src/components/canvas/` |
| 图纸渲染 | 新增 `canvas-drawing-render-dialog.tsx` 和 BizyAir `web_app_id: 51345` adapter |
| 视频生成 | 继续使用 `web/src/services/api/video.ts`，不增加 DMDS Provider |
| 局部重绘 | 改造现有 `canvas-node-mask-edit-dialog.tsx`，补矩形选区、比例和羽化 |
| 双相机多角度 | 改造现有 `canvas-node-angle-dialog.tsx`，接 `web_app_id: 51218` |
| 全景生成 | 复用 `requestEdit()`，固定输出目标为 2:1 等距柱状投影 |
| 全景查看 | 新增 `canvas-node-panorama-dialog.tsx`，使用 Three.js |
| AI 超分 | 保留本地放大，AI 模式接 `web_app_id: 51263` |
| 材质库 | 继续使用 `use-asset-store.ts` 和 `pages/assets/`，不迁移 Electron 文件夹授权 |
| 专业角色 | 新增 `use-role-store.ts` 和画布角色工作流弹窗 |
| 双图对比 | 新增选择感知的 `canvas-node-compare-dialog.tsx` |
| 自由标注 | 第二阶段新增 `canvas-node-annotate-dialog.tsx`，产出新图片节点 |

## Phase 1: Read-only Image Tools

### Task 1: Add two-image comparison

**Files:**
- Create: `web/src/components/canvas/canvas-node-compare-dialog.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-context-menu.tsx`
- Modify: `web/src/components/canvas/canvas-toolbar.tsx`

- [x] Implement an Ant Design Modal that accepts exactly two resolved image URLs.
- [x] Render both images in one stable aspect-ratio viewport; clip the upper image with a vertical draggable divider.
- [x] Keep zoom, pan and divider position in component refs so pointer movement does not update Zustand or resize the modal.
- [x] Support wheel zoom around the cursor, pointer-drag pan, divider drag, double-click reset and Escape close.
- [x] Register all global pointer/keyboard listeners inside effects and remove every listener during cleanup.
- [x] Enable the action only when exactly two selected nodes are non-empty image nodes; otherwise show a disabled state or concise warning.
- [x] Resolve both original images through the existing image storage helpers instead of comparing thumbnails.
- [x] Do not write nodes, connections, history or project metadata.

**Acceptance:** Two differently sized images remain aligned inside the viewport; repeated open/close does not duplicate pointer handling; changing the divider does not move canvas nodes.

### Task 2: Add the panorama viewer

**Files:**
- Create: `web/src/components/canvas/canvas-node-panorama-dialog.tsx`
- Modify: `web/src/components/canvas/canvas-image-toolbar-tools.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

- [x] Add `three` as the only new runtime dependency for the core migration.
- [x] Dynamically import Three.js only after the viewer opens.
- [x] Render the image on the inside of a sphere using `SphereGeometry`, `MeshBasicMaterial` and a `PerspectiveCamera`.
- [x] Support pointer rotation, wheel FOV adjustment, touch interaction and optional auto-rotation.
- [x] Pause auto-rotation after direct user interaction.
- [x] On close, cancel the animation frame, remove listeners, dispose geometry/material/texture/renderer and remove the renderer canvas.
- [x] Allow non-2:1 images with a distortion warning rather than blocking preview.
- [x] Keep the tool read-only and independent from canvas node position or viewport state.

**Acceptance:** Opening a 2:1 image produces a nonblank 360-degree scene; reopening the dialog does not create extra canvases or animation loops.

## Phase 2: BizyAir Workflow Foundation

### Task 3: Add workflow configuration

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/components/layout/app-config-modal.tsx`

- [ ] Add `workflowConfig: { bizyair: BizyAirWorkflowConfig }` beside the existing generic model channel configuration.
- [ ] Default `baseUrl` to `https://api.bizyair.cn` and default `apiKey` to an empty string.
- [ ] Add a compact “专业工作流” configuration section with Base URL and masked API Key inputs.
- [ ] Do not add `bizyair` to `ApiCallFormat`; OpenAI/Gemini channel resolution remains unchanged.
- [ ] Ensure WebDAV synchronization and exported canvas JSON do not contain the BizyAir API key.

**Acceptance:** Generic image/video model configuration behaves exactly as before; professional workflow actions can independently detect whether BizyAir is configured.

### Task 4: Add the BizyAir adapter

**Files:**
- Create: `web/src/services/api/bizyair-workflows.ts`
- Create: `web/src/types/ai-workflow.ts`

- [ ] Implement `submitBizyAirWorkflow(config, input, signal)` and `pollBizyAirWorkflow(config, externalTaskId, signal)` as stateless functions.
- [ ] Map drawing render to `web_app_id: 51345`, multi-angle to `51218`, and upscale to `51263`.
- [ ] Preserve the DMDS input key names required by each remote ComfyUI workflow, but rebuild request objects with typed functions.
- [ ] Accept image data URLs from callers; do not access React components or Zustand from the service.
- [ ] Normalize direct outputs and asynchronous responses into `{ externalTaskId?, resultUrls, status, error? }`.
- [ ] Parse BizyAir `status`, `outputs[].object_url`, `output_values`, `message`, `msg` and `error` variants.
- [ ] Use axios with `AbortSignal`; do not fall back to `127.0.0.1:9528` or any project proxy.

**Acceptance:** Each workflow builds the exact fixed request fields documented by DMDS, and all response shapes produce one normalized result type.

### Task 5: Add persistent task state and global polling

**Files:**
- Create: `web/src/stores/use-workflow-task-store.ts`
- Create: `web/src/hooks/use-workflow-task-runner.ts`
- Modify: `web/src/components/layout/client-root-init.tsx`

- [ ] Persist only serializable `AiWorkflowTask` records through `localForageStorage`.
- [ ] Provide `enqueueTask`, `updateTask`, `cancelTask`, `retryTask`, `removeTask` and `clearCompletedTasks` actions.
- [ ] Mount one runner at application root so route changes do not stop submission or polling.
- [ ] Keep active AbortControllers in a module-local Map keyed by task ID; never persist them.
- [ ] On hydration, resume tasks with an `externalTaskId`; queued tasks without one may be submitted only if their source node still exists.
- [ ] Use bounded polling with a five-second interval and a thirty-minute deadline.
- [ ] Prevent duplicate runners by atomically moving tasks from `queued` to `submitting` before awaiting network work.
- [ ] Mark a task failed with an actionable message when the source project/node or API configuration no longer exists.

**Acceptance:** Starting a task, switching routes and refreshing the page results in one remote submission and continued polling rather than duplicate jobs.

### Task 6: Add the task center

**Files:**
- Create: `web/src/components/layout/workflow-task-drawer.tsx`
- Modify: `web/src/components/layout/app-top-nav.tsx`

- [ ] Add a low-visual-weight task icon to the top navigation with an active/failed count badge.
- [ ] Show workflow name, source project, status, elapsed time and error in an Ant Design Drawer.
- [ ] Expose cancel for active tasks, retry for failed tasks, and remove for completed/cancelled tasks.
- [ ] Keep result import failures distinct from remote generation failures.

**Acceptance:** Tasks remain inspectable outside the canvas route and failure details do not expose credentials or full base64 payloads.

## Phase 3: First End-to-end Remote Workflow

### Task 7: Connect AI upscale

**Files:**
- Modify: `web/src/components/canvas/canvas-node-upscale-dialog.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/types/canvas.ts`

- [ ] Keep the existing local resize path unchanged.
- [ ] Replace the current placeholder AI-super-resolution path with BizyAir target resolution options 2048 and 4096.
- [ ] Create one loading image node connected from the source node before enqueueing the task.
- [ ] Store `workflowTaskId`, `workflowType` and `workflowResultIndex: 0` in the loading node metadata.
- [ ] Subscribe in `project.tsx` to completed tasks for the current project and update matching placeholders with functional `setNodes`.
- [ ] Download the remote result, pass the Blob to `uploadImage()`, and write local image metadata/storageKey to the placeholder.
- [ ] If result download is blocked by CORS, keep the task result available for retry and mark the placeholder as error; do not persist a temporary remote URL as node content.
- [ ] If the placeholder was deleted, leave the result in the task center without creating an unexpected node.

**Acceptance:** Upscale survives route changes and refresh; success creates one connected local image node; deleting its placeholder does not reinsert it.

## Phase 4: Professional Image Workflows

### Task 8: Add drawing render

**Files:**
- Create: `web/src/components/canvas/canvas-drawing-render-dialog.tsx`
- Create: `web/src/lib/canvas/drawing-render-prompt.ts`
- Modify: `web/src/components/canvas/canvas-image-toolbar-tools.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

- [ ] Add “图纸渲染” to the selected image node tool set.
- [ ] Provide photography and custom JSON templates, optional text description, and optional reference image chosen from current canvas image nodes.
- [ ] Keep the built-in photography template in a dedicated constant file, not embedded in the React component.
- [ ] Validate custom JSON before enqueueing and preserve the raw JSON string required by the remote workflow.
- [ ] Create one connected placeholder and enqueue a `drawing-render` task using `web_app_id: 51345`.
- [ ] Reuse the same task-to-placeholder result importer introduced by AI upscale.

**Acceptance:** Source-only and source-plus-reference requests produce a result node without modifying either input node; invalid custom JSON never sends a request.

### Task 9: Upgrade multi-angle generation

**Files:**
- Modify: `web/src/components/canvas/canvas-node-angle-dialog.tsx`
- Create: `web/src/components/canvas/multi-angle-camera-preview.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

- [ ] Preserve the existing generic prompt-based angle generation as a separate “通用模型” mode.
- [ ] Add a “双相机工作流” mode with two sets of horizontal angle, vertical angle and zoom controls.
- [ ] Use a lightweight Three.js camera widget loaded only in this mode; keep high-frequency camera motion in refs.
- [ ] Enqueue one `multi-angle` task and create two connected loading nodes with result indexes 0 and 1.
- [ ] Import each successful output independently; one missing output must not discard the other.
- [ ] Record the camera parameters in task metadata and result node prompts for later inspection.

**Acceptance:** The default camera values match DMDS behavior; two remote outputs map deterministically to the two placeholders; generic angle generation remains available.

### Task 10: Add panorama generation

**Files:**
- Modify: `web/src/components/canvas/canvas-image-toolbar-tools.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Create: `web/src/lib/canvas/panorama-prompt.ts`

- [ ] Add a “生成全景” action distinct from the read-only panorama viewer.
- [ ] Build a fixed instruction requesting a seamless 2:1 equirectangular panorama while preserving the source scene.
- [ ] Reuse the existing `requestEdit()` path and configured image model instead of BizyAir.
- [ ] Force the request size/aspect configuration to 2:1 without changing the user's global default settings.
- [ ] Create a connected result node and allow immediate opening in the panorama viewer.

**Acceptance:** The request does not mutate global image preferences and the generated node retains a source connection and panorama workflow metadata.

## Phase 5: Existing Feature Gap Completion

### Task 11: Extend local inpainting

**Files:**
- Modify: `web/src/components/canvas/canvas-node-mask-edit-dialog.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/lib/image-utils.ts`

- [ ] Keep the current brush mask mode.
- [ ] Add a rectangular selection mode with free, 1:1, 16:9 and 9:16 ratios.
- [ ] Add a feather radius control and generate a blurred alpha transition in the mask using Canvas 2D APIs.
- [ ] Allow existing canvas image nodes to be selected as additional style references.
- [ ] Continue using `requestEdit()` and create a new connected image node rather than replacing the source.
- [ ] Store the prompt and selection parameters needed for retry in result metadata without storing duplicate base64 content.

**Acceptance:** Brush and rectangular modes produce valid masks; feathering changes only the mask boundary; the original image node remains unchanged.

### Task 12: Add professional role workflows

**Files:**
- Create: `web/src/stores/use-role-store.ts`
- Create: `web/src/components/canvas/canvas-role-workflow-dialog.tsx`
- Create: `web/public/roles.json`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-toolbar.tsx`

- [ ] Convert the seven DMDS built-in roles into structured JSON containing ID, name, description and system prompt; do not copy emoji-only avatars as the primary UI control.
- [ ] Load built-ins from `roles.json` and persist only user-created, edited and deleted role overrides through localforage.
- [ ] Support role creation, editing, deletion and restoration of built-ins in one canvas workflow dialog.
- [ ] Read the currently selected text/image nodes as inputs and call the existing text model through `requestImageQuestion()`.
- [ ] Create one text result node and connect every selected input node to it.
- [ ] Do not add role chat sessions, a role page or another global assistant panel.

**Acceptance:** A role can analyze text-only, image-only and mixed selections; outputs appear as ordinary editable text nodes; Codex Agent state is unaffected.

## Phase 6: Optional Annotation Enhancement

### Task 13: Add non-destructive image annotation

**Files:**
- Create: `web/src/components/canvas/canvas-node-annotate-dialog.tsx`
- Create: `web/src/lib/canvas/canvas-image-annotation.ts`
- Modify: `web/src/components/canvas/canvas-image-toolbar-tools.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

- [ ] Provide brush, rectangle, arrow, text and eraser tools with color and size controls.
- [ ] Store transient strokes/text objects inside the dialog; do not persist an editor document format in the canvas project.
- [ ] Composite annotations over the original image only when the user confirms.
- [ ] Upload the flattened result through `uploadImage()` and create a connected child node.
- [ ] Support undo/reset within the dialog; cancelling must leave no canvas or storage changes.

**Acceptance:** Every tool renders at original-image coordinates regardless of preview scaling; confirming creates one flattened child image and cancelling creates nothing.

## Phase 7: Documentation and Security Closure

### Task 14: Record user-visible changes

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Review only: `docs/content/docs/progress/todo.mdx`

- [ ] Add concise `[新增]`/`[调整]` entries to `CHANGELOG.md` `Unreleased` for completed user-visible phases.
- [ ] Add concrete manual verification items to `pending-test.mdx` for comparison, panorama, workflow recovery, each BizyAir workflow, inpainting and roles.
- [ ] Confirm whether TODO contains matching items; do not add or remove unrelated TODO entries.
- [ ] Do not update `overview/features.mdx` until the user confirms testing passed.

### Task 15: Remove unsafe source assumptions

- [ ] Verify no code, document or fixture contains the DMDS Tencent COS `secretId` or `secretKey`.
- [ ] Verify no request fallback targets `127.0.0.1:9528`.
- [ ] Verify task errors, logs, exported projects and WebDAV payloads exclude API keys and base64 request bodies.
- [ ] Treat the credentials present in the DMDS package as compromised and rotate them outside this repository.

## Manual Acceptance Matrix

- Exactly two selected images can open comparison; zero, one or three selections cannot.
- Comparison and panorama viewers survive repeated open/close without duplicate listeners or rendering loops.
- Generic OpenAI/Gemini generation behavior and saved channel configuration remain unchanged.
- Missing BizyAir configuration routes the user to configuration without creating placeholders or tasks.
- Remote success, rejection, timeout, cancellation and output-download CORS failure all produce distinct task states.
- A submitted task continues through route changes and resumes after a page refresh without duplicate submission.
- Deleting a source node, placeholder or project does not cause a completed task to overwrite another project.
- Multi-angle partial success preserves the available image.
- Local media results are stored through storageKey rather than large base64 strings in Zustand.
- New controls and dialogs remain legible in both canvas themes and do not overlap at desktop widths.
- Existing crop, split, local upscale, generic multi-angle, video, assets, prompts and Codex Agent workflows remain available.

## Execution Order

Implement and review one task at a time in the numbered order. Tasks 1-2 establish the React integration pattern, Tasks 3-7 establish the remote-task foundation, Tasks 8-12 complete the selected core migration, Task 13 is optional second-stage scope, and Tasks 14-15 close documentation and security requirements.
