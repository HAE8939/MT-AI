import { beforeEach, describe, expect, mock, test } from "bun:test";

const post = mock(async () => ({ data: { data: [{ b64_json: "cmVzdWx0" }] } }));
const convertDataUrlToPng = mock(async () => "data:image/png;base64,c291cmNl");

mock.module("axios", () => ({
    default: { post, get: mock(async () => ({ data: {} })) },
}));
mock.module("@/lib/image-utils", () => ({
    convertDataUrlToPng,
    dataUrlToFile: (image: { dataUrl: string; name: string; type: string }) => {
        const [header, content] = image.dataUrl.split(",", 2);
        const type = header.match(/data:(.*?);base64/)?.[1] || image.type;
        return new File([Uint8Array.from(atob(content), (value) => value.charCodeAt(0))], image.name, { type });
    },
    formatBytes: () => "",
    formatDuration: () => "",
    getDataUrlByteSize: () => 0,
    readFileAsDataUrl: mock(async () => ""),
    readImageMeta: mock(async () => ({ width: 1, height: 1, mimeType: "image/png" })),
}));
mock.module("@/lib/mask-inpaint", () => ({
    binarizeMaskDataUrl: mock(async (dataUrl: string) => dataUrl),
    compositeMaskedRegion: mock(async (_source: string, generated: string) => generated),
    cropDataUrlRect: mock(async (dataUrl: string) => dataUrl),
    expandMaskRect: mock((rect: unknown) => rect),
    readMaskSelectionRect: mock(async () => null),
}));

const { defaultConfig } = await import("@/stores/use-config-store");
const { requestEdit, requestGeneration } = await import("./image");

function config(model: string, size: string, quality = "auto") {
    return { ...defaultConfig, model, imageModel: model, size, quality, count: "1" };
}

beforeEach(() => {
    post.mockClear();
    convertDataUrlToPng.mockClear();
});

describe("GPT Image request parameters", () => {
    test("serializes multiple gpt-image-2 edit inputs as image[]", async () => {
        await requestEdit(config("gpt-image-2", "auto"), "prompt", [
            { id: "source", name: "source.png", type: "image/png", dataUrl: "data:image/png;base64,c291cmNl" },
            { id: "style", name: "style.png", type: "image/png", dataUrl: "data:image/png;base64,c3R5bGU=" },
        ]);

        const body = post.mock.calls[0][1] as FormData;
        expect(body.getAll("image[]")).toHaveLength(2);
        expect(body.getAll("image")).toHaveLength(0);
    });

    test("omits response_format for gpt-image-2", async () => {
        await requestGeneration(config("gpt-image-2", "1:1"), "prompt");

        const body = post.mock.calls[0][1] as Record<string, unknown>;
        expect(body.response_format).toBeUndefined();
        expect(body.output_format).toBe("png");
    });

    test("maps gpt-image-1 ratios to its fixed output sizes", async () => {
        await requestGeneration(config("gpt-image-1", "4:3", "high"), "prompt");

        const body = post.mock.calls[0][1] as Record<string, unknown>;
        expect(body.size).toBe("1536x1024");
    });

    test("converts the first masked edit input to PNG", async () => {
        await requestEdit(
            config("gpt-image-2", "auto"),
            "prompt",
            [{ id: "source", name: "source.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,c291cmNl" }],
            { id: "mask", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,bWFzaw==" },
        );

        const body = post.mock.calls[0][1] as FormData;
        const source = body.getAll("image[]")[0] as File;
        expect(convertDataUrlToPng).toHaveBeenCalledTimes(1);
        expect(source.type).toBe("image/png");
    });
});
