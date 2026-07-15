import type { CanvasNodeData, Position, ViewportTransform } from "@/types/canvas";

export const ARRANGE_GRID_COLUMNS = 5;
export const ARRANGE_GRID_GAP = 48;

export type ArrangeBounds = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

export function arrangeImageNodesInGrid(nodes: CanvasNodeData[], columns = ARRANGE_GRID_COLUMNS, gap = ARRANGE_GRID_GAP): { positions: Map<string, Position>; bounds: ArrangeBounds | null } {
    const positions = new Map<string, Position>();
    if (!nodes.length) return { positions, bounds: null };

    const ordered = [...nodes].sort((a, b) => (a.position.y === b.position.y ? a.position.x - b.position.x : a.position.y - b.position.y));
    const cellWidth = Math.max(...ordered.map((node) => node.width));
    const cellHeight = Math.max(...ordered.map((node) => node.height));
    const startX = Math.min(...ordered.map((node) => node.position.x));
    const startY = Math.min(...ordered.map((node) => node.position.y));
    const bounds: ArrangeBounds = { left: startX, top: startY, right: startX, bottom: startY };

    ordered.forEach((node, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = startX + column * (cellWidth + gap) + (cellWidth - node.width) / 2;
        const y = startY + row * (cellHeight + gap) + (cellHeight - node.height) / 2;
        positions.set(node.id, { x, y });
        bounds.right = Math.max(bounds.right, x + node.width);
        bounds.bottom = Math.max(bounds.bottom, y + node.height);
    });

    return { positions, bounds };
}

export function fitViewportToBounds(bounds: ArrangeBounds, viewportSize: { width: number; height: number }, padding = 80): ViewportTransform {
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    const k = Math.min(1, Math.max(0.05, Math.min((viewportSize.width - padding * 2) / width, (viewportSize.height - padding * 2) / height)));

    return {
        x: viewportSize.width / 2 - (bounds.left + width / 2) * k,
        y: viewportSize.height / 2 - (bounds.top + height / 2) * k,
        k,
    };
}
