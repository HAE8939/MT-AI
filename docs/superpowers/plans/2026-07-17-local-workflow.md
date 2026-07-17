# 本地自建工作流（多步本地生成串跑）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户把画布上跑通的一串本地 AI 生成步骤（文生图 → 参考图编辑 → 放大…）选中保存为可复用工作流，运行时填几个输入槽、点一次即按依赖顺序自动串跑完成。

**Architecture:** 复用现有画布模板快照 `{nodes, connections}` + 新增输入槽标记；运行时把快照以新 id 插入当前画布（走 `canvasContext.applyOps`），对快照里的生成节点（Config 节点）做一次静态拓扑排序，逐步 `await` 一个新增的可等待生成原语 `runGenerationAndWait`（对现有 `handleGenerateNode` 的薄包装 + 节点 diff），每步跑完把下游连线从"空占位结果节点"重连到实际产出节点，使下一步自动吃到上一步的图。不依赖 RunningHub 云端，不新增任务执行器。

**Tech Stack:** React 19 + zustand + antd 6 + TypeScript（严格）；测试用 `bun test`（`bun:test`，测试文件与源码同目录 `*.test.ts`）；构建 Vite。

## Global Constraints

- 语言：所有面向用户的文案、提示、message 均为中文。
- 测试运行器：`bun test`（不是 vitest/jest）。测试文件命名 `*.test.ts`，与被测源码同目录；导入用相对路径或 `@/` 别名（参考 `web/src/components/prompts/prompt-combo.test.ts`）。
- 严格类型：`bun run typecheck`（= `tsc --noEmit`）必须通过。
- 所有 web 命令在 `web/` 目录下执行。
- 现有 `canvas` 模板（`spec.kind === "canvas"`，"插入即用"）语义保持不变；本功能是新增第四种 spec 类型，不得改动现有三种（`doc-analysis`/`runninghub`/`canvas`）的运行行为。
- v1 范围：只做图片链（image 模式）、只做串行一条链；不做分支/并行/条件/循环、不做 video/audio/text 步骤串跑、不做跨刷新恢复、不做远程取消。
- 提交粒度：每个 Task 结束时提交一次；提交信息中文，结尾带 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

## 文件结构

- **新建** `web/src/lib/canvas/local-workflow.ts` — 本地工作流全部纯逻辑（输入槽识别、拓扑排序、id 重映射、输入值应用的纯部分、步间重连）。无 React/DOM 依赖，可单测。
- **新建** `web/src/lib/canvas/local-workflow.test.ts` — 上述纯逻辑的 `bun test` 单测。
- **新建** `web/src/components/workflow/use-local-workflow-run.ts` — 运行编排 hook：填槽状态、插入画布、异步上传输入图、串跑循环、进度与错误。与现有 `use-runninghub-run.ts` 平级。
- **新建** `web/src/components/workflow/local-workflow-run-panel.tsx` — 画布侧栏内嵌运行面板（填槽 + 进度），参考 `canvas-workflow-run-panel.tsx`。
- **新建** `web/src/components/workflow/save-local-workflow-dialog.tsx` — 保存对话框（命名 + 输入槽增删改）。
- **修改** `web/src/types/workflow.ts` — 新增 `LocalWorkflowInputSlot`、`LocalWorkflowSpec`，并入 `AgentTemplateSpec` 联合。
- **修改** `web/src/stores/use-agent-store.ts` — `AgentCanvasContext` 增加可选 `runGenerationAndWait`。
- **修改** `web/src/pages/canvas/project.tsx` — 实现 `runGenerationAndWait` 并挂进 canvasContext；新增"保存为本地工作流"入口，挂到工具栏保存按钮的分流。
- **修改** `web/src/components/canvas/canvas-workflow-tab.tsx` — 列表识别 `local-workflow`，运行进入本地工作流面板。
- **修改** `web/src/pages/workflows/index.tsx` — `specKindLabel` 支持第三类标签，`startRun` 分流本地工作流。
- **修改** `docs/content/docs/progress/pending-test.mdx`、`CHANGELOG.md`、`README.md` — 文档收尾。

---

## Task 1: 数据模型（新增 local-workflow spec 类型）

**Files:**
- Modify: `web/src/types/workflow.ts`

**Interfaces:**
- Produces:
  - `type LocalWorkflowInputSlot = { nodeId: string; label: string; kind: "text" | "image" }`
  - `type LocalWorkflowSpec = { kind: "local-workflow"; nodes: CanvasNodeData[]; connections: CanvasConnection[]; inputs: LocalWorkflowInputSlot[] }`
  - `AgentTemplateSpec` 联合新增 `LocalWorkflowSpec`

- [ ] **Step 1: 新增类型并并入联合**

在 `web/src/types/workflow.ts` 中，`CanvasTemplateSpec` 定义之后、`AgentTemplateSpec` 之前插入：

```ts
/** 本地工作流的一个运行时输入槽：指向快照中某个节点，运行时由用户填值 */
export type LocalWorkflowInputSlot = {
    /** 指向 LocalWorkflowSpec.nodes 中节点的原始 id（快照内 id，运行时会重映射） */
    nodeId: string;
    /** 展示名，如「产品原图」「风格描述」 */
    label: string;
    /** image=图片输入（选画布节点/本地上传）；text=文本输入（提示词） */
    kind: "text" | "image";
};

/** 本地自建工作流：一组节点+连线快照 + 输入槽标记，运行时按依赖顺序自动串跑本地生成 */
export type LocalWorkflowSpec = {
    kind: "local-workflow";
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    inputs: LocalWorkflowInputSlot[];
};
```

然后把 `AgentTemplateSpec` 改为：

```ts
export type AgentTemplateSpec = DocAnalysisSpec | RunningHubSpec | CanvasTemplateSpec | LocalWorkflowSpec;
```

- [ ] **Step 2: typecheck 通过**

Run: `cd web && bun run typecheck`
Expected: 无报错（新增类型未被消费，仅并入联合不会破坏现有 `switch`/`if` 分支，因为它们用的是显式 `=== "kind"` 判断）。

- [ ] **Step 3: 提交**

```bash
git add web/src/types/workflow.ts
git commit -m "feat(workflow): 新增 local-workflow spec 类型与输入槽

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: 纯逻辑层 `local-workflow.ts`（TDD 核心）

**Files:**
- Create: `web/src/lib/canvas/local-workflow.ts`
- Test: `web/src/lib/canvas/local-workflow.test.ts`

**Interfaces:**
- Consumes: `CanvasNodeData`, `CanvasConnection`, `CanvasNodeType`（`@/types/canvas`）；`LocalWorkflowInputSlot`（`@/types/workflow`）；`nanoid`。
- Produces（供 Task 4/5 消费，签名必须与此处完全一致）：
  - `isConfigStepNode(node: CanvasNodeData): boolean` — 该节点是否是"生成步骤"（Config 节点，或带 `generationMode`/`prompt` 的可生成节点）。
  - `detectInputSlots(nodes: CanvasNodeData[], connections: CanvasConnection[]): LocalWorkflowInputSlot[]` — 识别叶子输入节点为默认输入槽。
  - `topoSortStepNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]): string[]` — 生成步骤节点的执行顺序（nodeId 列表）；有环抛 `Error("工作流存在循环依赖，无法保存为可串跑工作流")`。
  - `remapSnapshotIds(nodes: CanvasNodeData[], connections: CanvasConnection[]): { nodes: CanvasNodeData[]; connections: CanvasConnection[]; idMap: Map<string, string> }` — 整体换新 id，返回 `原始id → 新id`。
  - `relinkStep(connections: CanvasConnection[], stepNodeId: string, producedPrimaryId: string, beforeNodeIds: Set<string>): { connections: CanvasConnection[]; removedNodeIds: string[] }` — 把 step 的旧占位结果节点的下游连线重指向实际产出，返回新连线与应删除的占位节点 id。

- [ ] **Step 1: 写失败测试**

创建 `web/src/lib/canvas/local-workflow.test.ts`：

```ts
import { describe, expect, test } from "bun:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { detectInputSlots, isConfigStepNode, relinkStep, remapSnapshotIds, topoSortStepNodes } from "./local-workflow";

function img(id: string, content?: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata: content ? { content } : {} };
}
function cfg(id: string, prompt = "p"): CanvasNodeData {
    return { id, type: CanvasNodeType.Config, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { prompt, generationMode: "image" } };
}
function edge(from: string, to: string): CanvasConnection {
    return { id: `${from}->${to}`, fromNodeId: from, toNodeId: to };
}

describe("isConfigStepNode", () => {
    test("Config 节点是步骤", () => {
        expect(isConfigStepNode(cfg("c1"))).toBe(true);
    });
    test("空图片输入节点不是步骤", () => {
        expect(isConfigStepNode(img("i1"))).toBe(false);
    });
});

describe("topoSortStepNodes", () => {
    test("线性链 input→A→R_a→B 返回 [A, B]", () => {
        const nodes = [img("in"), cfg("A"), img("Ra"), cfg("B"), img("Rb")];
        const connections = [edge("in", "A"), edge("A", "Ra"), edge("Ra", "B"), edge("B", "Rb")];
        expect(topoSortStepNodes(nodes, connections)).toEqual(["A", "B"]);
    });
    test("检测环抛错", () => {
        const nodes = [cfg("A"), img("Ra"), cfg("B"), img("Rb")];
        const connections = [edge("A", "Ra"), edge("Ra", "B"), edge("B", "Rb"), edge("Rb", "A")];
        expect(() => topoSortStepNodes(nodes, connections)).toThrow("循环依赖");
    });
});

describe("detectInputSlots", () => {
    test("无上游的空图片节点与提示词文本节点成为输入槽", () => {
        const text: CanvasNodeData = { id: "t", type: CanvasNodeType.Text, title: "风格", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "赛博朋克" } };
        const nodes = [img("in"), text, cfg("A"), img("Ra")];
        const connections = [edge("in", "A"), edge("t", "A"), edge("A", "Ra")];
        const slots = detectInputSlots(nodes, connections);
        expect(slots.map((s) => ({ nodeId: s.nodeId, kind: s.kind }))).toEqual([
            { nodeId: "in", kind: "image" },
            { nodeId: "t", kind: "text" },
        ]);
    });
    test("中间产出的占位结果节点不算输入槽", () => {
        const nodes = [img("in"), cfg("A"), img("Ra"), cfg("B")];
        const connections = [edge("in", "A"), edge("A", "Ra"), edge("Ra", "B")];
        expect(detectInputSlots(nodes, connections).map((s) => s.nodeId)).toEqual(["in"]);
    });
});

describe("remapSnapshotIds", () => {
    test("节点与连线 id 全部重映射且引用一致", () => {
        const nodes = [cfg("A"), img("Ra")];
        const connections = [edge("A", "Ra")];
        const { nodes: rn, connections: rc, idMap } = remapSnapshotIds(nodes, connections);
        expect(idMap.get("A")).toBeDefined();
        expect(rn.map((n) => n.id)).toEqual([idMap.get("A"), idMap.get("Ra")]);
        expect(rc[0].fromNodeId).toBe(idMap.get("A"));
        expect(rc[0].toNodeId).toBe(idMap.get("Ra"));
        expect(rc[0].id).not.toBe("A->Ra");
    });
});

describe("relinkStep", () => {
    test("把旧占位结果的下游连线重指向实际产出并标记删除占位", () => {
        // 运行 A 前：A→Ra(占位)→B；A 跑完新增 A→Ra'(实际产出)
        const before = new Set(["A", "Ra", "B"]);
        const connections = [edge("A", "Ra"), edge("Ra", "B"), edge("A", "Ra_real")];
        const { connections: next, removedNodeIds } = relinkStep(connections, "A", "Ra_real", before);
        // Ra→B 应变成 Ra_real→B；A→Ra 占位边与 Ra 节点应被移除
        expect(next.some((c) => c.fromNodeId === "Ra_real" && c.toNodeId === "B")).toBe(true);
        expect(next.some((c) => c.toNodeId === "Ra")).toBe(false);
        expect(next.some((c) => c.fromNodeId === "Ra")).toBe(false);
        expect(removedNodeIds).toEqual(["Ra"]);
    });
    test("无占位结果时原样返回", () => {
        const before = new Set(["A"]);
        const connections = [edge("A", "A_real")];
        const { connections: next, removedNodeIds } = relinkStep(connections, "A", "A_real", before);
        expect(next).toEqual(connections);
        expect(removedNodeIds).toEqual([]);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/lib/canvas/local-workflow.test.ts`
Expected: FAIL（`Cannot find module './local-workflow'` 或各函数未定义）。

- [ ] **Step 3: 写实现**

创建 `web/src/lib/canvas/local-workflow.ts`：

```ts
import { nanoid } from "nanoid";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import type { LocalWorkflowInputSlot } from "@/types/workflow";

/** 生成步骤节点：Config 节点，或带 generationMode/prompt 的可生成节点 */
export function isConfigStepNode(node: CanvasNodeData): boolean {
    if (node.type === CanvasNodeType.Config) return true;
    return Boolean(node.metadata?.generationMode || node.metadata?.prompt) && node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Text;
}

/** 该节点是否有指向它的上游连线（有 = 中间产物，非叶子输入） */
function hasUpstream(nodeId: string, connections: CanvasConnection[]): boolean {
    return connections.some((connection) => connection.toNodeId === nodeId);
}

/** 识别默认输入槽：没有上游、且是图片/文本的叶子节点 */
export function detectInputSlots(nodes: CanvasNodeData[], connections: CanvasConnection[]): LocalWorkflowInputSlot[] {
    const slots: LocalWorkflowInputSlot[] = [];
    for (const node of nodes) {
        if (hasUpstream(node.id, connections)) continue;
        if (node.type === CanvasNodeType.Image) slots.push({ nodeId: node.id, label: node.title || "输入图片", kind: "image" });
        else if (node.type === CanvasNodeType.Text) slots.push({ nodeId: node.id, label: node.title || "文本输入", kind: "text" });
    }
    return slots;
}

/**
 * 生成步骤的执行顺序：步骤 A 早于 B ⇔ 存在路径 A → (占位结果) → B。
 * 用 Kahn 算法对"步骤子图"做拓扑排序；有环抛错。
 */
export function topoSortStepNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]): string[] {
    const stepIds = nodes.filter(isConfigStepNode).map((node) => node.id);
    const stepSet = new Set(stepIds);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    // 步骤间依赖：A → X → ... → B，中途只经过非步骤节点（占位结果）
    const successors = new Map<string, Set<string>>(stepIds.map((id) => [id, new Set<string>()]));
    const outgoing = new Map<string, string[]>();
    for (const connection of connections) {
        const list = outgoing.get(connection.fromNodeId) || [];
        list.push(connection.toNodeId);
        outgoing.set(connection.fromNodeId, list);
    }
    for (const start of stepIds) {
        const seen = new Set<string>();
        const stack = [...(outgoing.get(start) || [])];
        while (stack.length) {
            const current = stack.pop()!;
            if (seen.has(current)) continue;
            seen.add(current);
            if (stepSet.has(current)) {
                successors.get(start)!.add(current);
                continue; // 到下一个步骤即停，不穿透
            }
            if (!nodeById.has(current)) continue;
            for (const next of outgoing.get(current) || []) stack.push(next);
        }
    }

    const indegree = new Map<string, number>(stepIds.map((id) => [id, 0]));
    successors.forEach((succ) => succ.forEach((to) => indegree.set(to, (indegree.get(to) || 0) + 1)));
    const queue = stepIds.filter((id) => (indegree.get(id) || 0) === 0);
    const order: string[] = [];
    while (queue.length) {
        const id = queue.shift()!;
        order.push(id);
        for (const to of successors.get(id) || []) {
            indegree.set(to, (indegree.get(to) || 0) - 1);
            if ((indegree.get(to) || 0) === 0) queue.push(to);
        }
    }
    if (order.length !== stepIds.length) throw new Error("工作流存在循环依赖，无法保存为可串跑工作流");
    return order;
}

/** 整体换新 id，返回 原始id → 新id 映射（节点顺序保持不变） */
export function remapSnapshotIds(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const idMap = new Map<string, string>(nodes.map((node) => [node.id, nanoid()]));
    const remappedNodes = nodes.map((node) => ({ ...node, id: idMap.get(node.id)! }));
    const remappedConnections = connections
        .filter((connection) => idMap.has(connection.fromNodeId) && idMap.has(connection.toNodeId))
        .map((connection) => ({ id: nanoid(), fromNodeId: idMap.get(connection.fromNodeId)!, toNodeId: idMap.get(connection.toNodeId)! }));
    return { nodes: remappedNodes, connections: remappedConnections, idMap };
}

/**
 * 步间重连：step 跑完后，把它的"旧占位结果节点"（step 的下游、且在运行前就存在的节点）
 * 的下游连线重指向实际产出 producedPrimaryId，并移除占位节点及其入边。
 */
export function relinkStep(connections: CanvasConnection[], stepNodeId: string, producedPrimaryId: string, beforeNodeIds: Set<string>) {
    const placeholderIds = connections
        .filter((connection) => connection.fromNodeId === stepNodeId && connection.toNodeId !== producedPrimaryId && beforeNodeIds.has(connection.toNodeId))
        .map((connection) => connection.toNodeId);
    const placeholderSet = new Set(placeholderIds);
    if (!placeholderSet.size) return { connections, removedNodeIds: [] as string[] };
    const next = connections
        // 删除 step → 占位 的边
        .filter((connection) => !(connection.fromNodeId === stepNodeId && placeholderSet.has(connection.toNodeId)))
        // 占位 → 下游 重指向实际产出
        .map((connection) => (placeholderSet.has(connection.fromNodeId) ? { ...connection, fromNodeId: producedPrimaryId } : connection));
    return { connections: next, removedNodeIds: placeholderIds };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && bun test src/lib/canvas/local-workflow.test.ts`
Expected: PASS（全部用例通过）。

- [ ] **Step 5: typecheck 通过**

Run: `cd web && bun run typecheck`
Expected: 无报错。

- [ ] **Step 6: 提交**

```bash
git add web/src/lib/canvas/local-workflow.ts web/src/lib/canvas/local-workflow.test.ts
git commit -m "feat(workflow): 本地工作流纯逻辑（拓扑排序/输入槽/重映射/重连）+ 单测

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: 可等待生成原语 `runGenerationAndWait` + 扩展 canvasContext

**Files:**
- Modify: `web/src/stores/use-agent-store.ts`（`AgentCanvasContext` 加字段）
- Modify: `web/src/pages/canvas/project.tsx`（实现并挂载）

**Interfaces:**
- Consumes: `handleGenerateNode`（`project.tsx:2434`，`(nodeId, mode, prompt) => Promise<void>`）、`nodesRef`（`project.tsx:337`，每渲染经 `project.tsx:548` 的 effect 同步为最新 `nodes`）、`connectionsRef`、`isAiConfigReady`。
- Produces: `AgentCanvasContext.runGenerationAndWait?: (nodeId: string, prompt: string) => Promise<{ status: "success" | "error"; producedNodeIds: string[]; primaryNodeId?: string }>`。

**说明:** v1 不改 `handleGenerateNode` 内部（最小风险）。`runGenerationAndWait` 是它的薄包装：记录运行前节点 id 集合 → await 生成 → 从 `nodesRef.current` diff 出"由该 step 新连出的图片节点"作为产出，读其 `status` 得成败。串跑时 `handleGenerateNode` 会短暂改选区/开面板（可接受的 UI 闪动），配置缺失会弹配置框——由编排器在开跑前统一 `isAiConfigReady` 预检规避。

- [ ] **Step 1: 扩展 AgentCanvasContext 类型**

在 `web/src/stores/use-agent-store.ts` 第 11 行 `AgentCanvasContext` 定义改为：

```ts
export type AgentCanvasContext = {
    snapshot: CanvasAgentSnapshot;
    applyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot;
    undoOps: () => CanvasAgentSnapshot | null;
    canUndo: boolean;
    /** 本地工作流串跑用：触发单个生成节点并等待完成，回报实际产出节点 */
    runGenerationAndWait?: (nodeId: string, prompt: string) => Promise<{ status: "success" | "error"; producedNodeIds: string[]; primaryNodeId?: string }>;
};
```

- [ ] **Step 2: 在 project.tsx 实现 runGenerationAndWait**

在 `web/src/pages/canvas/project.tsx` 中，`undoAgentOps`（约 `:862`）定义之后、`setAgentCanvasContext` 的 effect（约 `:878`）之前，新增：

```ts
const runGenerationAndWait = useCallback(
    async (nodeId: string, prompt: string): Promise<{ status: "success" | "error"; producedNodeIds: string[]; primaryNodeId?: string }> => {
        const beforeIds = new Set(nodesRef.current.map((node) => node.id));
        const target = nodesRef.current.find((node) => node.id === nodeId);
        const mode = (target?.metadata?.generationMode as CanvasNodeGenerationMode) || "image";
        const effectivePrompt = prompt.trim() ? prompt : target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "";
        await handleGenerateNodeRef.current?.(nodeId, mode, effectivePrompt);
        // 生成完成后 nodesRef.current 已同步（project.tsx:548 的 effect）。
        // 产出 = 由该 step 节点新连出的图片节点（运行前不存在）。
        const producedIds = connectionsRef.current
            .filter((connection) => connection.fromNodeId === nodeId && !beforeIds.has(connection.toNodeId))
            .map((connection) => connection.toNodeId);
        const producedNodes = nodesRef.current.filter((node) => producedIds.includes(node.id) && node.type === CanvasNodeType.Image);
        const primary = producedNodes.find((node) => node.metadata?.isBatchRoot) || producedNodes[0];
        const anySuccess = producedNodes.some((node) => node.metadata?.status === NODE_STATUS_SUCCESS);
        const stepNode = nodesRef.current.find((node) => node.id === nodeId);
        const stepFailed = stepNode?.metadata?.status === NODE_STATUS_ERROR;
        const status: "success" | "error" = anySuccess && !stepFailed ? "success" : "error";
        return { status, producedNodeIds: producedNodes.map((node) => node.id), primaryNodeId: primary?.id };
    },
    [],
);
```

同时，因为 `handleGenerateNode` 定义在本文件更靠后（`:2434`），这里通过一个 ref 引用它（与现有 `generateNodeRef` 同思路）。在 `generateNodeRef` 声明（`project.tsx:341`）下方新增：

```ts
const handleGenerateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
```

并在现有 `generateNodeRef.current = handleGenerateNode;` 的 effect（`project.tsx:2773-2775`）里补一行：

```ts
useEffect(() => {
    generateNodeRef.current = handleGenerateNode;
    handleGenerateNodeRef.current = handleGenerateNode;
}, [handleGenerateNode]);
```

- [ ] **Step 3: 挂进 canvasContext**

修改 `project.tsx:878-881` 的 effect，把 `runGenerationAndWait` 一并传入：

```ts
useEffect(() => {
    setAgentCanvasContext({ snapshot: agentSnapshot, applyOps: applyAgentOps, undoOps: undoAgentOps, canUndo: Boolean(agentUndoSnapshot), runGenerationAndWait });
    return () => setAgentCanvasContext(null);
}, [agentSnapshot, applyAgentOps, agentUndoSnapshot, setAgentCanvasContext, undoAgentOps, runGenerationAndWait]);
```

- [ ] **Step 4: typecheck 通过**

Run: `cd web && bun run typecheck`
Expected: 无报错。若报 `CanvasNodeGenerationMode` 未导入，确认它已在 `project.tsx` 顶部从 `@/types/canvas` 引入（现有 `handleGenerateNode` 已用该类型，通常已导入；未导入则补 import）。

- [ ] **Step 5: 提交**

```bash
git add web/src/stores/use-agent-store.ts web/src/pages/canvas/project.tsx
git commit -m "feat(workflow): 新增可等待生成原语 runGenerationAndWait 并挂入画布上下文

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: 保存为本地工作流（画布选中 → 保存对话框）

**Files:**
- Create: `web/src/components/workflow/save-local-workflow-dialog.tsx`
- Modify: `web/src/pages/canvas/project.tsx`（新增保存逻辑 + 打开对话框；分流保存按钮）

**Interfaces:**
- Consumes: `detectInputSlots`、`topoSortStepNodes`、`isConfigStepNode`（Task 2）；`useAgentTemplateStore().addTemplate`（`({ name, description, avatar?, category, spec }) => string`）；现有 `saveSelectionAsAgent` 的快照清洗逻辑（`project.tsx:2284-2323`）。
- Produces: 保存出的模板 `spec.kind === "local-workflow"`。

- [ ] **Step 1: 写保存对话框组件**

创建 `web/src/components/workflow/save-local-workflow-dialog.tsx`：

```tsx
import { useEffect, useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { Plus, Trash2 } from "lucide-react";

import type { LocalWorkflowInputSlot } from "@/types/workflow";

export type SaveLocalWorkflowPayload = { name: string; description: string; inputs: LocalWorkflowInputSlot[] };

export function SaveLocalWorkflowDialog({
    open,
    defaultInputs,
    stepCount,
    onCancel,
    onSave,
}: {
    open: boolean;
    defaultInputs: LocalWorkflowInputSlot[];
    stepCount: number;
    onCancel: () => void;
    onSave: (payload: SaveLocalWorkflowPayload) => void;
}) {
    const { message } = App.useApp();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [inputs, setInputs] = useState<LocalWorkflowInputSlot[]>([]);

    useEffect(() => {
        if (!open) return;
        setName("");
        setDescription("");
        setInputs(defaultInputs);
    }, [open, defaultInputs]);

    const save = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            message.warning("请填写工作流名称");
            return;
        }
        const valid = inputs.filter((slot) => slot.nodeId.trim() && slot.label.trim());
        onSave({ name: trimmed, description: description.trim(), inputs: valid });
    };

    return (
        <Modal title="保存为本地工作流" open={open} onCancel={onCancel} onOk={save} okText="保存" cancelText="取消" width={640} destroyOnHidden>
            <div className="space-y-4">
                <div className="rounded-md bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                    共 {stepCount} 个生成步骤。运行时将按依赖顺序自动串跑，下面标记的输入槽会在运行前让用户填值。
                </div>
                <Input value={name} placeholder="工作流名称（如：产品图两步精修）" onChange={(event) => setName(event.target.value)} />
                <Input value={description} placeholder="说明（可空）" onChange={(event) => setDescription(event.target.value)} />
                <div>
                    <div className="mb-2 text-sm font-medium">输入槽</div>
                    <div className="space-y-2">
                        {inputs.map((slot, index) => (
                            <div key={index} className="grid grid-cols-[1fr_96px_32px] items-center gap-2">
                                <Input
                                    value={slot.label}
                                    placeholder="展示名（如：产品原图）"
                                    onChange={(event) => setInputs((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))}
                                />
                                <Select
                                    value={slot.kind}
                                    options={[{ value: "image", label: "图片" }, { value: "text", label: "文本" }]}
                                    onChange={(kind) => setInputs((current) => current.map((item, i) => (i === index ? { ...item, kind } : item)))}
                                />
                                <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => setInputs((current) => current.filter((_, i) => i !== index))} />
                            </div>
                        ))}
                        {inputs.length === 0 ? <div className="text-xs text-stone-400">未标记输入槽，运行时直接按快照默认值出图。</div> : null}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
```

> 说明：输入槽的 `nodeId` 由保存逻辑（Step 2）预填并保持；对话框只允许改 `label`/`kind` 与删除，不允许新增未知 nodeId 的槽（新增没有对应快照节点无意义）。故此处不放"添加"按钮。

- [ ] **Step 2: 在 project.tsx 新增保存逻辑与对话框状态**

在 `web/src/pages/canvas/project.tsx` 顶部 import 区补：

```ts
import { SaveLocalWorkflowDialog, type SaveLocalWorkflowPayload } from "@/components/workflow/save-local-workflow-dialog";
import { detectInputSlots, isConfigStepNode, topoSortStepNodes } from "@/lib/canvas/local-workflow";
import type { LocalWorkflowInputSlot } from "@/types/workflow";
```

在 `saveSelectionAsAgent`（`project.tsx:2284`）之后新增（复用其快照清洗，抽出共享的 `buildTemplateSnapshot`）：

```ts
/** 从当前选区构建去运行态的快照（图片/视频内容留空当输入槽，保留生成参数） */
const buildTemplateSnapshot = useCallback(() => {
    const selectedIds = new Set(selectedNodeIds);
    const selected = nodesRef.current.filter((node) => selectedIds.has(node.id));
    const innerConnections = connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId));
    const minX = selected.length ? Math.min(...selected.map((node) => node.position.x)) : 0;
    const minY = selected.length ? Math.min(...selected.map((node) => node.position.y)) : 0;
    const templateNodes = selected.map((node) => ({
        ...node,
        position: { x: node.position.x - minX, y: node.position.y - minY },
        metadata: node.metadata
            ? {
                  ...node.metadata,
                  content: node.type === CanvasNodeType.Text ? node.metadata.content : undefined,
                  composerContent: node.metadata.composerContent,
                  status: undefined,
                  errorDetails: undefined,
                  storageKey: undefined,
                  workflowTaskId: undefined,
                  batchChildIds: undefined,
                  batchRootId: undefined,
              }
            : undefined,
    }));
    return { templateNodes, innerConnections };
}, [selectedNodeIds]);

const [saveWorkflowState, setSaveWorkflowState] = useState<{ open: boolean; nodes: CanvasNodeData[]; connections: CanvasConnection[]; inputs: LocalWorkflowInputSlot[]; stepCount: number }>({ open: false, nodes: [], connections: [], inputs: [], stepCount: 0 });

const saveSelectionAsLocalWorkflow = useCallback(() => {
    const { templateNodes, innerConnections } = buildTemplateSnapshot();
    if (!templateNodes.length) {
        message.warning("请先选择要保存的节点");
        return;
    }
    const stepCount = templateNodes.filter(isConfigStepNode).length;
    if (!stepCount) {
        message.warning("所选节点里没有生成步骤，无法保存为可串跑的本地工作流");
        return;
    }
    try {
        topoSortStepNodes(templateNodes, innerConnections);
    } catch (error) {
        message.error(error instanceof Error ? error.message : "工作流依赖有误");
        return;
    }
    const inputs = detectInputSlots(templateNodes, innerConnections);
    setSaveWorkflowState({ open: true, nodes: templateNodes, connections: innerConnections, inputs, stepCount });
}, [buildTemplateSnapshot, message]);

const confirmSaveLocalWorkflow = useCallback((payload: SaveLocalWorkflowPayload) => {
    useAgentTemplateStore.getState().addTemplate({
        name: payload.name,
        description: payload.description || `${saveWorkflowState.stepCount} 个生成步骤 · 本地串跑`,
        category: "image",
        spec: { kind: "local-workflow", nodes: saveWorkflowState.nodes, connections: saveWorkflowState.connections, inputs: payload.inputs },
    });
    setSaveWorkflowState((current) => ({ ...current, open: false }));
    message.success("已保存为本地工作流，可在「工作流」页或面板「工作流」标签中运行");
}, [message, saveWorkflowState.nodes, saveWorkflowState.connections, saveWorkflowState.stepCount]);
```

> 注：`buildTemplateSnapshot` 与既有 `saveSelectionAsAgent` 重复了快照清洗；本 Task 只新增，不强制重构 `saveSelectionAsAgent`（保持其行为不变，避免波及现有画布模板）。若时间允许可让 `saveSelectionAsAgent` 也调用 `buildTemplateSnapshot`，但非必需。

- [ ] **Step 3: 渲染对话框并分流保存按钮**

现有工具栏保存按钮 `onSaveAgent={saveSelectionAsAgent}`（`project.tsx:3207`）。改为弹一个选择：用 antd `Modal.confirm` 或直接把按钮点击改成打开一个二选一小菜单。最小实现——把 `onSaveAgent` 指向一个新的分流函数：

```ts
const handleSaveButton = useCallback(() => {
    modal.confirm({
        title: "保存所选节点",
        content: "选择保存方式：画布模板（插入即用、手动跑）或本地工作流（填输入槽、一键串跑）。",
        okText: "本地工作流",
        cancelText: "画布模板",
        onOk: saveSelectionAsLocalWorkflow,
        onCancel: saveSelectionAsAgent,
    });
}, [modal, saveSelectionAsLocalWorkflow, saveSelectionAsAgent]);
```

确认 `modal` 已从 `App.useApp()` 取得（文件已用 `message`，通常一并解构 `const { message, modal } = App.useApp();`；若只解构了 `message`，补上 `modal`）。

把 `project.tsx:3207` 的 `onSaveAgent={saveSelectionAsAgent}` 改为 `onSaveAgent={handleSaveButton}`。

在页面 JSX 返回的末尾（与其他 Modal/Dialog 并列处，如 `CanvasToolbar` 同级的组件树里）挂上：

```tsx
<SaveLocalWorkflowDialog
    open={saveWorkflowState.open}
    defaultInputs={saveWorkflowState.inputs}
    stepCount={saveWorkflowState.stepCount}
    onCancel={() => setSaveWorkflowState((current) => ({ ...current, open: false }))}
    onSave={confirmSaveLocalWorkflow}
/>
```

- [ ] **Step 4: typecheck 通过**

Run: `cd web && bun run typecheck`
Expected: 无报错。确认 `CanvasNodeData`/`CanvasConnection` 已在 project.tsx 导入（现有代码已用，通常已导入）。

- [ ] **Step 5: 提交**

```bash
git add web/src/components/workflow/save-local-workflow-dialog.tsx web/src/pages/canvas/project.tsx
git commit -m "feat(workflow): 画布选中保存为本地工作流（命名+输入槽标记）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: 运行编排 hook `use-local-workflow-run.ts`

**Files:**
- Create: `web/src/components/workflow/use-local-workflow-run.ts`

**Interfaces:**
- Consumes: `useAgentStore().canvasContext`（含 `applyOps`、`runGenerationAndWait`，Task 3）；`remapSnapshotIds`、`topoSortStepNodes`、`relinkStep`（Task 2）；`uploadImage`（`@/services/image-storage`，`(input, options?) => Promise<UploadedImage>`，`UploadedImage.storageKey/url`）；`isAiConfigReady` 无法直接取——改为运行时若首步产出为空/报配置错则整体失败（见错误处理）。
- Produces: hook 返回 `{ spec, slotValues, setSlotText, setSlotImage, localFiles, canvasImageNodes, running, progress, lastError, run }`。

**说明:** 插入节点必须走 `canvasContext.applyOps`（→ `setNodes`，使 `handleGenerateNode` 能读到），不能用 `useCanvasStore.updateProject`（那条路 project.tsx 本地 state 不一定即时同步）。

- [ ] **Step 1: 写 hook**

创建 `web/src/components/workflow/use-local-workflow-run.ts`：

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";

import { useAgentStore } from "@/stores/use-agent-store";
import { uploadImage } from "@/services/image-storage";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { relinkStep, remapSnapshotIds, topoSortStepNodes } from "@/lib/canvas/local-workflow";
import type { AgentTemplate, LocalWorkflowSpec } from "@/types/workflow";

export type LocalWorkflowLocalFile = { file: File; previewUrl: string };

export function useLocalWorkflowRun(template: AgentTemplate | null) {
    const { message } = App.useApp();
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const spec = template?.spec.kind === "local-workflow" ? (template.spec as LocalWorkflowSpec) : null;

    const [slotValues, setSlotValues] = useState<Record<string, string>>({});
    const [localFiles, setLocalFiles] = useState<Record<string, LocalWorkflowLocalFile>>({});
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
    const [lastError, setLastError] = useState<string>("");
    const localFilesRef = useRef(localFiles);
    localFilesRef.current = localFiles;

    useEffect(() => {
        Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setSlotValues({});
        setLocalFiles({});
        setRunning(false);
        setProgress(null);
        setLastError("");
    }, [template?.id]);

    useEffect(() => () => Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

    const canvasImageNodes = useMemo(() => {
        const nodes = canvasContext?.snapshot.nodes || [];
        return nodes.filter((node) => node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
    }, [canvasContext?.snapshot.nodes]);

    const setSlotText = (nodeId: string, value: string) => {
        setSlotValues((current) => ({ ...current, [nodeId]: value }));
        setLocalFiles((current) => {
            if (!current[nodeId]) return current;
            URL.revokeObjectURL(current[nodeId].previewUrl);
            const next = { ...current };
            delete next[nodeId];
            return next;
        });
    };

    const setSlotImage = (nodeId: string, file: File | null) => {
        setLocalFiles((current) => {
            if (current[nodeId]) URL.revokeObjectURL(current[nodeId].previewUrl);
            const next = { ...current };
            if (file) next[nodeId] = { file, previewUrl: URL.createObjectURL(file) };
            else delete next[nodeId];
            return next;
        });
        if (file) setSlotValues((current) => ({ ...current, [nodeId]: "" }));
    };

    const run = async (): Promise<boolean> => {
        if (!template || !spec) return false;
        const context = useAgentStore.getState().canvasContext;
        if (!context?.applyOps || !context.runGenerationAndWait) {
            message.warning("请先打开一个画布再运行本地工作流");
            return false;
        }
        setRunning(true);
        setLastError("");
        try {
            // 1. 重映射 id
            const { nodes, connections, idMap } = remapSnapshotIds(spec.nodes, spec.connections);
            // 2. 计算步骤执行顺序（在重映射后的图上）
            const order = topoSortStepNodes(nodes, connections);
            // 3. 解析输入槽的值（图片先上传拿 storageKey）
            const slotPatch = new Map<string, { content: string; storageKey?: string }>();
            for (const slot of spec.inputs) {
                const newId = idMap.get(slot.nodeId);
                if (!newId) continue;
                if (slot.kind === "image") {
                    const local = localFiles[slot.nodeId];
                    if (local) {
                        const uploaded = await uploadImage(local.file, { fileName: local.file.name || "input.png" });
                        slotPatch.set(newId, { content: uploaded.url, storageKey: uploaded.storageKey });
                    } else {
                        const raw = (slotValues[slot.nodeId] || "").trim();
                        if (raw) {
                            const node = canvasImageNodes.find((item) => item.metadata?.content === raw);
                            slotPatch.set(newId, { content: raw, storageKey: node?.metadata?.storageKey });
                        }
                    }
                } else {
                    const raw = (slotValues[slot.nodeId] || "").trim();
                    if (raw) slotPatch.set(newId, { content: raw });
                }
            }
            // 4. 把节点插入当前画布（写入输入槽值），再连线
            const addOps: CanvasAgentOp[] = nodes.map((node) => {
                const patch = slotPatch.get(node.id);
                return {
                    type: "add_node",
                    id: node.id,
                    nodeType: node.type,
                    title: node.title,
                    position: { x: node.position.x + 80, y: node.position.y + 80 },
                    width: node.width,
                    height: node.height,
                    metadata: patch ? { ...node.metadata, content: patch.content, storageKey: patch.storageKey, status: "success" } : node.metadata,
                };
            });
            const connectOps: CanvasAgentOp[] = connections.map((connection) => ({ type: "connect_nodes", fromNodeId: connection.fromNodeId, toNodeId: connection.toNodeId }));
            context.applyOps([...addOps, ...connectOps]);

            // 5. 逐步串跑，步间重连
            let liveConnections = connections;
            for (let i = 0; i < order.length; i++) {
                const stepId = order[i];
                setProgress({ current: i + 1, total: order.length, label: `第 ${i + 1}/${order.length} 步` });
                const beforeIds = new Set(useAgentStore.getState().canvasContext?.snapshot.nodes.map((node) => node.id) || []);
                const result = await context.runGenerationAndWait!(stepId, "");
                if (result.status === "error" || !result.primaryNodeId) {
                    setLastError(`第 ${i + 1} 步生成失败`);
                    message.error(`第 ${i + 1} 步生成失败，已停止后续步骤`);
                    return false;
                }
                // 重连：把旧占位结果的下游边指向实际产出，删除占位
                const relinked = relinkStep(liveConnections, stepId, result.primaryNodeId, beforeIds);
                if (relinked.removedNodeIds.length) {
                    const relinkOps: CanvasAgentOp[] = [
                        { type: "delete_node", ids: relinked.removedNodeIds },
                        ...relinked.connections
                            .filter((connection) => connection.fromNodeId === result.primaryNodeId)
                            .map((connection): CanvasAgentOp => ({ type: "connect_nodes", fromNodeId: connection.fromNodeId, toNodeId: connection.toNodeId })),
                    ];
                    context.applyOps(relinkOps);
                }
                liveConnections = relinked.connections;
            }
            message.success("本地工作流已全部完成，结果在画布上");
            return true;
        } catch (error) {
            setLastError(error instanceof Error ? error.message : "运行失败");
            message.error(error instanceof Error ? error.message : "本地工作流运行失败");
            return false;
        } finally {
            setRunning(false);
            setProgress(null);
        }
    };

    return { spec, slotValues, setSlotText, setSlotImage, localFiles, canvasImageNodes, running, progress, lastError, run };
}
```

> 关键点：`delete_node` + 重连的 `connect_nodes` 都走 `applyOps`。`applyCanvasAgentOps` 的 `connect_nodes` 会跳过已存在或端点缺失的边（`canvas-agent-ops.ts:73-78`），删除占位节点后其入边由 `delete_node` 自动清理（`canvas-agent-ops.ts:63-68`），因此这里只需补建"实际产出 → 下游"的新边。

- [ ] **Step 2: typecheck 通过**

Run: `cd web && bun run typecheck`
Expected: 无报错。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/workflow/use-local-workflow-run.ts
git commit -m "feat(workflow): 本地工作流运行编排 hook（插入画布+串跑+步间重连）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: 运行面板 UI + 列表/页面接线

**Files:**
- Create: `web/src/components/workflow/local-workflow-run-panel.tsx`
- Modify: `web/src/components/canvas/canvas-workflow-tab.tsx`
- Modify: `web/src/pages/workflows/index.tsx`

**Interfaces:**
- Consumes: `useLocalWorkflowRun`（Task 5）；`LocalWorkflowSpec`；主题 `canvasThemes`。

- [ ] **Step 1: 写运行面板**

创建 `web/src/components/workflow/local-workflow-run-panel.tsx`：

```tsx
import { App, Button, Input, Progress, Select, Tag, Upload } from "antd";
import { ArrowLeft, ImagePlus, LayoutTemplate, Play } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useLocalWorkflowRun } from "@/components/workflow/use-local-workflow-run";
import type { AgentTemplate } from "@/types/workflow";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export function LocalWorkflowRunPanel({ template, theme, onBack }: { template: AgentTemplate; theme: Theme; onBack: () => void }) {
    const { message } = App.useApp();
    const { spec, slotValues, setSlotText, setSlotImage, localFiles, canvasImageNodes, running, progress, lastError, run } = useLocalWorkflowRun(template);

    if (!spec) return null;
    const canvasImageOptions = canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id }));

    return (
        <div className="flex min-h-full flex-col gap-3">
            <div className="flex items-center gap-1.5">
                <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} onClick={onBack} />
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: theme.toolbar.panel }}>{template.avatar || "🧩"}</span>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: theme.node.text }}>{template.name}</div>
                <Tag className="m-0 shrink-0 border-0 px-1.5 text-[10px] leading-4" icon={<LayoutTemplate className="mr-0.5 inline size-3" />}>本地工作流</Tag>
            </div>
            {template.description ? <div className="text-xs leading-5" style={{ color: theme.node.muted }}>{template.description}</div> : null}

            <div className="flex-1 space-y-4">
                {spec.inputs.map((slot) => {
                    if (slot.kind === "image") {
                        const previewSrc = localFiles[slot.nodeId]?.previewUrl || slotValues[slot.nodeId] || "";
                        return (
                            <div key={slot.nodeId} className="space-y-2">
                                <div className="text-xs font-medium" style={{ color: theme.node.text }}>{slot.label}</div>
                                {previewSrc ? (
                                    <img src={previewSrc} alt={slot.label} className="h-24 w-24 rounded-lg border object-cover" style={{ borderColor: theme.node.stroke }} />
                                ) : (
                                    <div className="grid h-24 w-24 place-items-center rounded-lg border border-dashed" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                        <ImagePlus className="size-5" />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Select
                                        className="min-w-0 flex-1"
                                        size="small"
                                        allowClear
                                        placeholder={canvasImageOptions.length ? "选画布图片" : "画布上还没有图片"}
                                        options={canvasImageOptions}
                                        value={!localFiles[slot.nodeId] && slotValues[slot.nodeId] ? slotValues[slot.nodeId] : undefined}
                                        onChange={(value) => setSlotText(slot.nodeId, value || "")}
                                    />
                                    <Upload
                                        accept="image/*"
                                        showUploadList={false}
                                        beforeUpload={(file) => {
                                            if (file.size > MAX_UPLOAD_BYTES) message.error("图片超过 30MB，请压缩后再试");
                                            else setSlotImage(slot.nodeId, file);
                                            return Upload.LIST_IGNORE;
                                        }}
                                    >
                                        <Button size="small">上传本地图</Button>
                                    </Upload>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={slot.nodeId} className="space-y-2">
                            <div className="text-xs font-medium" style={{ color: theme.node.text }}>{slot.label}</div>
                            <Input.TextArea rows={2} placeholder="填写内容" value={slotValues[slot.nodeId] || ""} onChange={(event) => setSlotText(slot.nodeId, event.target.value)} />
                        </div>
                    );
                })}
                {spec.inputs.length === 0 ? <div className="text-xs" style={{ color: theme.node.muted }}>此工作流没有输入槽，直接运行即可。</div> : null}
            </div>

            <div className="sticky bottom-0 space-y-2 pb-1 pt-2" style={{ background: theme.toolbar.panel }}>
                {progress ? <Progress percent={Math.round((progress.current / progress.total) * 100)} size="small" format={() => progress.label} /> : null}
                <Button type="primary" block size="large" icon={<Play className="size-4" />} loading={running} onClick={() => void run()}>
                    {running ? "串跑中…" : "立即运行"}
                </Button>
                {lastError ? (
                    <div className="rounded-md px-2 py-1.5 text-xs leading-5" style={{ color: "#f5222d", border: `1px solid ${theme.node.stroke}` }}>{lastError}</div>
                ) : null}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: 接入画布 workflow tab**

修改 `web/src/components/canvas/canvas-workflow-tab.tsx`：

顶部 import 补：

```ts
import { LocalWorkflowRunPanel } from "@/components/workflow/local-workflow-run-panel";
```

`startRun`（`:50-53`）改为分流三类：

```ts
const startRun = (template: AgentTemplate) => {
    if (template.spec.kind === "runninghub" || template.spec.kind === "local-workflow") setRunTarget(template);
    else insertCanvasTemplate(template);
};
```

运行视图渲染处（`:57-58`）改为按 kind 选面板：

```tsx
{activeTemplate && activeTemplate.spec.kind === "runninghub" ? (
    <CanvasWorkflowRunPanel template={activeTemplate} theme={theme} currentProjectId={currentProjectId || undefined} onBack={() => setRunTarget(null)} />
) : activeTemplate && activeTemplate.spec.kind === "local-workflow" ? (
    <LocalWorkflowRunPanel template={activeTemplate} theme={theme} onBack={() => setRunTarget(null)} />
) : (
```

（其余列表项渲染不变；列表里的类型标签 `cloud ? "云工作流" : "画布模板"` 改为三态，见下。）

把 `:71` 的 `const cloud = template.spec.kind === "runninghub";` 及标签区改为：

```tsx
const kindTag = template.spec.kind === "runninghub" ? { icon: <Cloud className="mr-0.5 inline size-3" />, label: "云工作流" } : template.spec.kind === "local-workflow" ? { icon: <LayoutTemplate className="mr-0.5 inline size-3" />, label: "本地工作流" } : { icon: <LayoutTemplate className="mr-0.5 inline size-3" />, label: "画布模板" };
```

并把标签 JSX（`:79-81`）用 `kindTag.icon` / `kindTag.label` 渲染。（`Cloud`、`LayoutTemplate` 已在该文件 import。）

- [ ] **Step 3: 接入 /workflows 页**

修改 `web/src/pages/workflows/index.tsx`：

`specKindLabel`（`:20-23`）改为三态：

```tsx
function specKindLabel(template: AgentTemplate) {
    if (template.spec.kind === "runninghub") return { label: "云工作流", icon: <Cloud className="size-3.5" /> };
    if (template.spec.kind === "local-workflow") return { label: "本地工作流", icon: <LayoutTemplate className="size-3.5" /> };
    return { label: "画布模板", icon: <LayoutTemplate className="size-3.5" /> };
}
```

`startRun`（`:56-59`）改为：

```tsx
const startRun = (template: AgentTemplate) => {
    if (template.spec.kind === "runninghub" || template.spec.kind === "local-workflow") setRunTarget(template);
    else insertCanvasTemplate(template);
};
```

`/workflows` 页的运行入口 `RunningHubRunDialog`（`:118`）只处理 runninghub。本地工作流在页面里点"运行"时，因为运行需要一个已挂载的画布（依赖 canvasContext），页面级没有画布上下文——因此 `/workflows` 页对 `local-workflow` 的"运行"应导航到画布并提示在侧栏运行，或直接复用 `setRunTarget` 打开一个提示。最小实现：`local-workflow` 的 `startRun` 改为提示去画布侧栏运行：

```tsx
const startRun = (template: AgentTemplate) => {
    if (template.spec.kind === "runninghub") setRunTarget(template);
    else if (template.spec.kind === "local-workflow") {
        message.info("本地工作流需在画布侧栏「工作流」标签中运行");
        navigate("/canvas");
    } else insertCanvasTemplate(template);
};
```

（`message`、`navigate` 已在该组件内。若 `/canvas` 不是有效空路由，改为导航到 `projects[0]` 或 `createProject` 后的画布——参照文件内 `insertCanvasTemplate` 已有的取/建画布逻辑。）

- [ ] **Step 4: typecheck 通过**

Run: `cd web && bun run typecheck`
Expected: 无报错。

- [ ] **Step 5: 端到端手测（真实画布串跑）**

启动 dev server（用 preview 工具或 `bun run dev`），执行：
1. 画布上放一个空图片节点 A（作为输入）→ 连到 Config1（image 模式、带提示词）；Config1 → 空图片节点 R1；R1 → Config2（image、edit 提示词）；Config2 → 空图片节点 R2。
2. 全选 5 个节点 → 工具栏"保存为工作流模板"按钮 → 选"本地工作流" → 命名、确认输入槽（应识别到 A 为图片输入槽）→ 保存。
3. 侧栏「工作流」tab → 找到该本地工作流 → 运行 → 给 A 上传/选一张图 → 立即运行。
4. 预期：进度显示"第 1/2 步""第 2/2 步"，Config1 出图后 Config2 自动以该图为参考出图，最终 R2 位置有成品；无手动干预。
Expected: 两步依次自动完成，结果写回画布。若某步失败，进度停止并提示"第 N 步生成失败"。

- [ ] **Step 6: 提交**

```bash
git add web/src/components/workflow/local-workflow-run-panel.tsx web/src/components/canvas/canvas-workflow-tab.tsx web/src/pages/workflows/index.tsx
git commit -m "feat(workflow): 本地工作流运行面板与列表/页面接线

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: 文档收尾

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`

- [ ] **Step 1: CHANGELOG**

在 `CHANGELOG.md` 的 Unreleased（未发布）中文条目区新增一行：

```
- 新增本地自建工作流：画布多选生成步骤可「保存为本地工作流」并标记输入槽，侧栏「工作流」标签填输入后一键按依赖顺序自动串跑本地生成，结果写回画布（v1 支持图片链）。
```

- [ ] **Step 2: README**

在 `README.md` 「核心功能」的「工作流模板与文档智能体」条目（约 `:30`）后补一句：

```
- 本地自建工作流：把画布上跑通的多步本地生成（文生图 → 参考图编辑 → 放大…）选中保存为工作流并标记输入槽，运行时填素材一键按依赖顺序自动串跑，不依赖云端（v1 图片链）。
```

- [ ] **Step 3: pending-test**

在 `docs/content/docs/progress/pending-test.mdx` 增加一条待验证项：

```
- 本地自建工作流串跑：画布搭「文生图 → 参考图编辑」两步链 → 保存为本地工作流（标记输入图槽）→ 侧栏运行填图 → 两步依次自动出图、结果写回画布；某步失败时停止并提示第 N 步失败。
```

- [ ] **Step 4: 提交**

```bash
git add CHANGELOG.md README.md docs/content/docs/progress/pending-test.mdx
git commit -m "docs: 记录本地自建工作流能力与待验证项

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 记录

**Spec 覆盖：**
- 数据模型（`local-workflow` spec + 输入槽）→ Task 1。
- 纯逻辑层（拓扑排序/输入槽识别/id 重映射/重连）+ 单测 → Task 2。
- 可等待生成原语 `runGenerationAndWait` + 绕开 UI 副作用（预检 + ref 包装）→ Task 3。
- 创建流程（画布选中→保存对话框）→ Task 4。
- 运行编排（插入画布→拓扑→串跑→步间重连）→ Task 5。
- 运行 UI + 列表/页面接线（三态标签、分流）→ Task 6。
- 测试与收尾（CHANGELOG/README/pending-test）→ Task 2 单测 + Task 6 e2e + Task 7 文档。
- YAGNI 不做项（分支/并行、video/audio/text 串跑、跨刷新恢复、远程取消）→ 已写入 Global Constraints，各 Task 未引入。

**类型一致性：**`LocalWorkflowSpec`/`LocalWorkflowInputSlot`（Task 1）→ Task 2/4/5/6 消费一致；`runGenerationAndWait` 签名（Task 3 定义）→ Task 5 调用 `runGenerationAndWait(stepId, "")` 一致，返回 `{ status, producedNodeIds, primaryNodeId }` 一致；`relinkStep` 返回 `{ connections, removedNodeIds }`（Task 2）→ Task 5 解构一致；`detectInputSlots`/`topoSortStepNodes`/`isConfigStepNode`/`remapSnapshotIds` 签名 Task 2 定义、Task 4/5 使用一致。

**已知风险（实现时注意）：**
- Task 3 的产出检测依赖"step 节点新连出的图片节点"。`handleGenerateNode` 对 Config 节点会连 `Config → rootId`（`project.tsx:2520`），符合假设；若某步是"空图片节点"输入型（`isEmptyImageNode`）则原地复用不新建，v1 工作流的步骤都是 Config 节点，不受影响。
- Task 5 插入位置加了 `+80` 偏移，避免与原画布节点完全重叠；如需更好布局可后续优化，不影响功能。
