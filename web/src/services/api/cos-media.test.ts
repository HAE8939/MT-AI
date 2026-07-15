import { describe, expect, test } from "bun:test";

import { buildCosObjectKey, buildCosObjectUrl } from "./cos-media";

describe("COS media helpers", () => {
    test("builds a stable dated object key", () => {
        expect(buildCosObjectKey("images", "photo.png", new Date("2026-07-15T08:00:00Z"), "fixed-id", "infinite-canvas")).toBe("infinite-canvas/images/2026/07/fixed-id.png");
    });

    test("normalizes a custom object prefix", () => {
        expect(buildCosObjectKey("assets", "sample.jpeg", new Date("2026-07-15T08:00:00Z"), "asset-id", "/studio/media/")).toBe("studio/media/assets/2026/07/asset-id.jpeg");
    });

    test("encodes every object URL segment", () => {
        expect(buildCosObjectUrl({ bucket: "demo-123", region: "ap-guangzhou", publicBaseUrl: "", key: "folder/a b/示例.png" })).toBe("https://demo-123.cos.ap-guangzhou.myqcloud.com/folder/a%20b/%E7%A4%BA%E4%BE%8B.png");
    });
});
