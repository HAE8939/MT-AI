# 本地自建工作流（多步本地生成串跑）设计

## 背景

当前「工作流」概念在产品里几乎等同于 RunningHub 云工作流：`/workflows` 页只能登记 RunningHub 工作流，画布侧栏「工作流」tab 也只有 RunningHub 模板获得「填参数 → 一键运行 → 结果写回」的引导式运行面板。用户无法把自己在画布上跑通的一串**本地** AI 步骤（文生图 → 参考图编辑 → 放大…）沉淀成可复用、换素材一键重跑的工作流。

本设计新增**本地自建工作流**：用户在画布上把一串本地生成步骤跑通后，选中这些节点保存为工作流；之后填几个输入槽，点一次「立即运行」，系统按依赖顺序自动跑完每一步，结果写回画布。不依赖 RunningHub 云端。

### 关键前提（已在代码中核实）

- 现有「保存为工作流模板」（`saveSelectionAsAgent`，`web/src/pages/canvas/project.tsx:2284`）存的就是 `{ nodes, connections }` 快照，并且已经把图片/视频节点的 `content`/`storageKey` 留空当「输入槽」、保留 `prompt`/`generationMode` 等生成参数骨架。本地工作流的保存逻辑是它的增强版。
- 画布的**生成依赖关系本来就用连线表达**：上一步的结果节点连入下一步的 Config 节点，`getGenerationResourceNodes`（`web/src/lib/canvas/canvas-resource-references.ts:38`）+ `hydrateNodeGenerationContext`（`web/src/lib/canvas/canvas-node-generation.ts`）会自动把上游图当参考图、把 `storageKey` 解析成 dataUrl 喂进生成。
- 已存在一个**可 await、无 UI 依赖的生成原语** `handleGenerateNode(nodeId, mode, prompt): Promise<void>`（`web/src/pages/canvas/project.tsx:2434`），视频的内部轮询也包含在这个 Promise 里。它已通过 `generateNodeRef`（`project.tsx:341`）+ `run_generation` op（`project.tsx:849`）暴露成"无 UI 触发通道"，但目前是 fire-and-forget，没有完成回调。

因此本功能不需要重写生成引擎、不需要新的任务执行器，本质是：**画布模板 + 输入槽标记 + 一键按依赖顺序自动串跑 + 步间重连**。

## 范围（v1）

- **只做图片链**：文生图 / 图生图 / 参考图编辑 / 放大等 image 模式步骤。video/audio/text 步骤留待后续（生成原语已支持，仅出于串跑体验与稳定性先不放开）。
- **只做串行一条链**：不做分支并行、条件分支、循环。
- **不做跨刷新恢复**（本地生成本来就不支持，刷新后遗留 loading 会被标 error）、不做远程取消。
- 运行时可**中途整体停止**（复用现有 abort 机制），但不做单步重试队列。

## 数据模型

在 `web/src/types/workflow.ts` 的 `AgentTemplateSpec` 联合类型中新增一种 spec，并复用现有 `canvas` 快照的形状：

```ts
/** 本地工作流的一个运行时输入槽：指向快照中某个节点，运行时由用户填值 */
export type LocalWorkflowInputSlot = {
    /** 指向 LocalWorkflowSpec.nodes 中的节点 id（快照内的原始 id） */
    nodeId: string;
    /** 展示名，如「产品原图」「风格描述」 */
    label: string;
    /** image=图片输入（选画布节点/本地上传）；text=文本输入（提示词） */
    kind: "text" | "image";
};

/** 本地自建工作流：一组节点+连线的快照 + 输入槽标记，运行时按依赖顺序自动串跑本地生成 */
export type LocalWorkflowSpec = {
    kind: "local-workflow";
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    inputs: LocalWorkflowInputSlot[];
};

export type AgentTemplateSpec = DocAnalysisSpec | RunningHubSpec | CanvasTemplateSpec | LocalWorkflowSpec;
```

设计要点：

- **与现有 `canvas` 模板并存、互不影响**。`canvas` 模板保持"插入即用（手动跑）"语义；`local-workflow` 是"填槽 → 自动串跑"。两者在列表里用不同标签区分（云工作流 / 画布模板 / 本地工作流）。
- `inputs[].nodeId` 引用快照内节点的**原始 id**；运行时插入画布会重映射 id（见运行流程），编排器持有 `原始 id → 新 id` 映射来定位输入槽。
- 生成参数（`model`/`size`/`generationType`/`referencePurpose`/`composerContent` 等）随节点 metadata 一起存进快照，无需在 spec 里另建字段。

## 纯逻辑层：`web/src/lib/canvas/local-workflow.ts`

把所有可单测的纯函数集中在这个新文件，与 UI/React 解耦（项目已有 `web/src/components/prompts/prompt-combo.test.ts` 的 vitest 先例）：

1. **`detectInputSlots(nodes, connections): LocalWorkflowInputSlot[]`**
   识别「叶子输入节点」作为默认输入槽：没有上游生成连线的、内容被留空的图片节点（→ `kind: "image"`），以及作为纯输入的文本/提示词节点（→ `kind: "text"`）。用于保存对话框预选，用户可增删改。

2. **`topoSortGenerationNodes(nodes, connections): string[]`**
   对快照中的生成节点（Config 节点，或带 `generationMode`/`prompt` 的可生成节点）按连线做拓扑排序，返回执行顺序的 nodeId 列表。检测环 → 抛出可读错误（保存/运行前拦截）。

3. **`remapSnapshotIds(spec): { nodes, connections, idMap }`**
   把快照节点/连线整体换成新 id（复用现有 `insertCanvasTemplate` 的 idMap 思路），返回 `idMap: Map<原始id, 新id>`，供输入槽定位与步间重连使用。

4. **`applyInputValues(nodes, inputs, values, idMap): CanvasNodeData[]`**
   把用户填的值写进对应输入槽节点：text → 写 `metadata.content`/`prompt`；image → 上传后写 `metadata.content`/`storageKey`。

5. **`relinkAfterStep(connections, oldTargetId, producedNodeIds): CanvasConnection[]`**
   步间重连（本设计唯一不平凡处，见下）。

单测覆盖：拓扑排序（线性链、分叉汇聚、环检测）、输入槽识别、id 重映射一致性、重连映射。

## 运行编排器：`runGenerationAndWait` + 串跑循环

### 1. 新增可等待的生成原语

在 `web/src/pages/canvas/project.tsx` 中，与 `generateNodeRef` 同级新挂一个 ref：

```ts
runGenerationAndWait(nodeId, mode, prompt): Promise<{ status: "success" | "error"; producedNodeIds: string[]; error?: string }>
```

它是 `handleGenerateNode` 的返回增强版：

- 复用 `handleGenerateNode` 的全部不变式（批量子节点、空节点复用、edit/generation 判定），**不复刻**。
- 串跑模式下跳过会打断体验的 UI 副作用：不 `openConfigDialog`（改为串跑开始前统一 `isAiConfigReady` 校验，未就绪直接整体失败并提示）、不 `setDialogNodeId`/不抢占选区（给 `handleGenerateNode` 加一个 `silent`/`headless` 参数）。
- 返回本步实际**产出的节点 id**（`producedNodeIds`）——因为图片生成是"新建子节点"而非填占位，编排器需要它做重连。

### 2. 串跑循环（编排器，建议放 `web/src/components/workflow/use-local-workflow-run.ts`）

```
1. 校验 AI 配置就绪；否则整体失败。
2. remapSnapshotIds(spec) → 插入当前画布（复用 insertCanvasTemplate 的插入逻辑）。
3. applyInputValues：把用户填的值写进输入槽节点。
4. order = topoSortGenerationNodes(...)
5. for (const stepNodeId of order):
     - 更新进度「第 i/N 步：<步骤名>」。
     - const { status, producedNodeIds, error } = await runGenerationAndWait(stepNodeId, "image", prompt)
     - if (status === "error") { 标红该步、停止、提示 error；break }
     - relinkAfterStep：把"模板里连向本步旧结果占位"的下游连线，改指向 producedNodeIds 的主产出节点。
6. 全部成功 → 提示完成；结果已在画布上。
```

### 3. 步间重连（唯一技术难点，已确认可解）

模板保存时，链路是「Config A → 结果占位 R_a → Config B」。但运行时 `handleGenerateNode(A)` 会**新建**实际结果子节点 `R_a'`，而不是填充 `R_a`。因此在跑 B 之前，必须把「R_a → Config B」这条连线改成「R_a' → Config B」，`getGenerationResourceNodes` 才能把 B 的参考图指向真正的产出。

`relinkAfterStep` 用 `producedNodeIds` 做这个替换。多产出（count>1）时取主产出节点（`primaryImageId` 或首个成功子节点）。此逻辑纯数据、可单测。

> 备选（更省事但更侵入）：让 `handleGenerateNode` 在"源节点是空占位图片节点"时原地复用（`isEmptyImageNode` 分支已存在）。若能让每步的结果直接填进模板里的占位节点，则无需重连。v1 优先走 `relinkAfterStep` 方案（对 `handleGenerateNode` 改动最小），把原地复用作为后续优化。

## 创建流程（画布选中 → 保存为工作流）

在现有「保存为工作流模板」（`saveSelectionAsAgent`）基础上新增「保存为本地工作流」路径。UI 上：画布工具栏保存按钮弹一个小选择（保存为「画布模板」还是「本地工作流」），或在保存对话框里选类型。

保存为本地工作流时：

1. 复用 `saveSelectionAsAgent` 的快照清洗（去运行时状态、图片内容留空、保留生成参数）。
2. `topoSortGenerationNodes` 校验无环，且至少含一个生成节点；否则提示不能保存为可串跑工作流。
3. `detectInputSlots` 预选输入槽，弹对话框让用户命名、增删、改展示名（label）。
4. 存为 `spec: { kind: "local-workflow", nodes, connections, inputs }`，category 固定 image。

## 运行 UI（复用 RunningHub 骨架）

- **`/workflows` 页**（`web/src/pages/workflows/index.tsx`）：`specKindLabel` 支持第三种类型「本地工作流」（图标区分）；`startRun` 对 `local-workflow` 走本地工作流运行入口。
- **画布 workflow tab**（`web/src/components/canvas/canvas-workflow-tab.tsx`）：列表项支持本地工作流标签；点运行进入内嵌运行面板，与 RunningHub 并列。
- **运行面板**：大量复用 `canvas-workflow-run-panel.tsx` 的图片/文本填槽 UI（画布节点选择 + 本地上传、底部大按钮、进度条）。差异：底部进度显示「第 i/N 步」串跑进度而非单个云任务状态；数据源是 `LocalWorkflowSpec.inputs` 而非 `RunningHubParamField`。

新增运行 hook `use-local-workflow-run.ts` 与现有 `use-runninghub-run.ts` 平级，封装填槽状态、插入画布、串跑编排、进度。

## 错误处理

- **AI 配置未就绪**：串跑开始前统一校验，整体失败并提示去配置页，不中途弹配置对话框。
- **某步生成失败**：该步节点标红（复用现有 `NODE_STATUS_ERROR` 回写），停止后续步骤，运行面板显示失败步骤与错误信息。
- **快照含环 / 无生成节点**：保存时即拦截并中文提示。
- **输入槽未填**：可运行（走节点默认值/空值），与 RunningHub 面板一致；必要时对 image 空槽提示。
- 所有提示走 antd `message`/面板内联文案，不破坏现有任务失败展示路径。

## 测试

- `web/src/lib/canvas/local-workflow.test.ts`（vitest）：拓扑排序（线性/分叉汇聚/环）、`detectInputSlots`、`remapSnapshotIds` id 一致性、`relinkAfterStep` 重连映射、`applyInputValues`。
- 端到端手测：画布搭「文生图 → 参考图编辑」两步链 → 保存为本地工作流 → 填提示词/源图 → 一键运行 → 两步依次自动出图、结果写回画布。补充到 `docs/content/docs/progress/pending-test.mdx`。

## 收尾

- `CHANGELOG.md` Unreleased 增加中文条目。
- README「云工作流」段落旁补一句本地自建工作流能力。
- 验证完成后更新 `pending-test.mdx`。

## 明确不做（YAGNI）

- 分支/并行/条件/循环编排。
- video/audio/text 步骤串跑（原语支持，v1 不放开）。
- 跨刷新恢复、远程取消、单步重试队列。
- 可视化 DAG 编辑器（沿用画布本身作为编辑器，不另造）。
