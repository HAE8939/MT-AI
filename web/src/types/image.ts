import type { CanvasImageReferencePurpose } from "@/types/canvas";

export type ReferenceImage = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    purpose?: CanvasImageReferencePurpose;
};
