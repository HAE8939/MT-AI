# 画布侧栏 RunningHub 式运行面板设计

## 背景与目标

RunningHub 官方站以侧边栏面板运行工作流：图片缩略图上传、数值步进器、底部醒目「立即运行」按钮，结果回到画布。MT-AI 当前画布侧栏「工作流」tab 只是卡片列表，点「运行」弹出居中模态框填参数，体验割裂。本设计把画布侧栏的云工作流运行体验改造为 RunningHub 式内嵌面板。

前置依赖：RunningHub OpenAPI v2 迁移已完成（见 `2026-07-17-runninghub-workflow-design.md` 的 v2 更新章节）。

## 已确认的决策

- **应用范围**：只改画布侧栏「工作流」tab；`/workflows` 工作流页的运行弹窗维持现状不动。
- **面板结构**：视图切换式——tab 内部 列表视图 ↔ 运行视图 切换，点云工作流卡片进入该工作流的专属运行视图；画布模板卡片行为不变（直接插入画布）。
- **参数类型**：`RunningHubParamField.kind` 增加 `"number"`，侧栏渲染 -/+ 步进器；不引入 min/max/step 配置。
- **图片来源**：仅两种——①选画布图片节点（打开面板时若画布已选中图片节点，自动预填第一个图片字段）；②本地文件上传（缩略图预览，提交时经 v2 上传接口换 fileName）。**侧栏不提供 URL 粘贴输入**（弹窗保留原有 URL 能力不动）。
- **提交后行为**：停留在运行视图，表单保留，底部状态条实时显示最近任务进度，便于改参数迭代重跑。
- **结果必须在画布上体现**：沿用现有链路——提交时在目标画布创建 loading 占位节点，任务成功后结果图写回该节点（`project.tsx` 监听逻辑不动）；同画布提交不做页面跳转，仅聚焦占位节点。

## 设计

### 1. 类型扩展（`web/src/types/workflow.ts`）

`RunningHubParamField.kind`: `"text" | "image" | "number"`。数值字段 UI 用 antd InputNumber（步进器），`defaultValue` 仍为字符串，提交时数值转字符串写入 `fieldValue`。登记弹窗（`/workflows` 页）类型下拉同步增加「数值」选项。

JSON 导入的自动识别维持现状（LoadImage→图片、CLIPTextEncode→文本）：ComfyUI 工作流中数字输入极多（steps/cfg/尺寸等），自动全识别会淹没参数列表，数值参数由用户手动加行。

### 2. 共享运行逻辑抽取（新 hook `useRunningHubRun`）

从 `runninghub-run-dialog.tsx` 抽出核心逻辑为 hook，弹窗与侧栏面板共同消费：

- 字段值状态（`values`、`setValue`）+ 本地文件状态（`localFiles: Map<index, File>`）；
- 图片字段解析：画布节点 → `getImageBlob(storageKey)` → v2 上传换 fileName；本地 File → 直接上传；
- 组装 nodeInfoList（空值字段跳过不覆盖，数值与文本同规则）；
- 入队任务 + 目标画布创建占位节点 + 聚焦/跳转；
- 返回 `uploading`、`run()`、`lastTaskId`（供侧栏状态条查任务）。

弹窗重构为消费该 hook，交互与现状完全一致（含 URL 透传路径——URL 解析逻辑保留在 hook 内，只是侧栏 UI 不提供 URL 输入）。

### 3. 侧栏运行视图（新组件 `canvas-workflow-run-panel.tsx`）

`CanvasWorkflowTab` 内部状态 `activeTemplate: AgentTemplate | null`：null 显示列表视图（现状），非 null 显示运行视图。布局自上而下：

1. 返回栏：← 返回按钮 + 工作流名 + 「云工作流」标签；
2. 图片字段：缩略图卡片（未选时为空态占位），下方两个入口——「选画布图片」（下拉列出当前画布全部图片节点，带小缩略图）与「上传本地图」（antd Upload，`beforeUpload` 返回 false 仅存状态，objectURL 显示缩略图，超 30MB 提示官方限制并拒绝）；
3. 文本字段：TextArea（placeholder 显示 defaultValue）；数值字段：InputNumber 步进器（初始值取 defaultValue）；
4. 结果写入画布：Select，默认当前画布；
5. 底部 sticky「立即运行」大按钮（上传中 loading 态「上传图片中…」）；
6. 最近任务状态条：按 `lastTaskId` 从任务 store 读状态（排队/运行中/成功/失败+原因），成功显示「已写回画布」。

fields 为空的工作流（如预置 Z Image）：运行视图显示模板描述 + 运行按钮，无参数表单。

自动预填：打开运行视图时读取 `canvasContext.snapshot.selectedNodeIds`（`CanvasAgentSnapshot` 已含此字段），若其中存在图片节点则将第一个填入第一个 image 字段；无选中态则跳过，不阻塞。

### 4. 错误处理

- 无 API Key：提示去配置弹窗填写，不入队；
- 上传失败：中文 message 报错，不入队、面板不退出、表单不清空；
- 面板打开期间切换画布：画布图片下拉实时取当前画布节点；已选的失效节点在提交解析失败时报错兜底；
- 取消语义沿用现状（关闭面板/切换模板递增 session 使进行中的上传作废）。

## 明确不做

- `/workflows` 页运行弹窗的任何 UI 改动；
- 侧栏 URL 粘贴输入；
- JSON 导入自动识别数值参数；
- min/max/step 等数值约束配置；
- 多输出全部上画布、视频结果写回修复（既有已知欠账，另行处理）。

## 改动范围

| 文件 | 改动 |
|---|---|
| `web/src/types/workflow.ts` | kind 增加 `"number"` |
| `web/src/components/workflow/use-runninghub-run.ts` | 新增：共享运行 hook |
| `web/src/components/workflow/runninghub-run-dialog.tsx` | 重构为消费 hook，行为不变 |
| `web/src/components/canvas/canvas-workflow-run-panel.tsx` | 新增：侧栏运行视图 |
| `web/src/components/canvas/canvas-workflow-tab.tsx` | 列表↔运行视图切换 |
| `web/src/pages/workflows/index.tsx` | 登记弹窗类型下拉加「数值」 |

## 验证

- `typecheck` + `build` 通过；
- 浏览器实测：进入/返回运行视图、本地图缩略图预览、步进器交互、空字段跳过（空 nodeInfoList 提交）、无 Key 守卫提示、提交后状态条出现；
- 真实出图（用户持 Key 验证）：高清放大工作流登记（图片+数值参数）→ 侧栏上传本地图 → 运行 → 结果写回画布节点；同步更新 `pending-test.mdx`。
