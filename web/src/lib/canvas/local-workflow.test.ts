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
        const newA = idMap.get("A");
        const newRa = idMap.get("Ra");
        expect(newA).toBeDefined();
        expect(newRa).toBeDefined();
        expect(rn.map((n) => n.id)).toEqual([newA as string, newRa as string]);
        expect(rc[0].fromNodeId).toBe(newA as string);
        expect(rc[0].toNodeId).toBe(newRa as string);
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
