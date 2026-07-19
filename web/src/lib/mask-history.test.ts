import { describe, expect, test } from "bun:test";

import { canRedoMaskSnapshot, createMaskHistory, currentMaskSnapshot, recordMaskSnapshot, redoMaskSnapshot, undoMaskSnapshot } from "@/lib/mask-history";

describe("mask history", () => {
    test("moves backward and forward through mask snapshots", () => {
        let history = createMaskHistory("blank");
        history = recordMaskSnapshot(history, "stroke-1");
        history = recordMaskSnapshot(history, "stroke-2");

        history = undoMaskSnapshot(history);
        expect(currentMaskSnapshot(history)).toBe("stroke-1");
        history = redoMaskSnapshot(history);
        expect(currentMaskSnapshot(history)).toBe("stroke-2");
    });

    test("drops redo snapshots after a new stroke", () => {
        let history = recordMaskSnapshot(createMaskHistory("blank"), "stroke-1");
        history = undoMaskSnapshot(history);
        history = recordMaskSnapshot(history, "replacement");

        expect(currentMaskSnapshot(history)).toBe("replacement");
        expect(canRedoMaskSnapshot(history)).toBe(false);
    });
});
