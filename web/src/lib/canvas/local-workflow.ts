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
