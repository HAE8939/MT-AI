import type { CanvasImageReferencePurpose } from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";

export const imageReferencePurposeLabels: Record<CanvasImageReferencePurpose, string> = {
    style: "风格参考",
    composition: "构图参考",
    color: "色彩参考",
    material: "材质参考",
};

export function imageReferenceLabel(index: number) {
    return `图片${index + 1}`;
}

export function imageReferencePurposeLabel(purpose?: CanvasImageReferencePurpose) {
    return purpose ? imageReferencePurposeLabels[purpose] : undefined;
}

export function buildImageReferencePromptText(prompt: string, references: ReferenceImage[]) {
    const text = prompt.trim();
    if (!references.length) return text;
    const labels = references.map((reference, index) => {
        const purposeLabel = imageReferencePurposeLabel(reference.purpose);
        return purposeLabel ? `[${imageReferenceLabel(index)}: ${purposeLabel}]` : imageReferenceLabel(index);
    });
    return `参考图片编号：${labels.join("、")}。请按这些编号理解提示词中的图片引用。\n\n${text}`;
}
