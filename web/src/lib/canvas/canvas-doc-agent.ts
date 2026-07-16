import { imageToDataUrl } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

// 文档智能体的输入构造：从选中的画布节点提取图片与文字，交给文本模型分析。

/** 把画布图片节点转成多模态消息里的 image_url 片段（优先原图 dataURL）。 */
export async function buildRoleImageParts(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes
            .filter((node) => node.type === CanvasNodeType.Image && node.metadata?.content)
            .map(async (node) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl({ storageKey: node.metadata?.storageKey, url: node.metadata?.content }) } })),
    );
}

/** 提取节点上的文字内容（文本节点取正文，其余取提示词），拼成分析输入。 */
export function buildRoleTextInputs(nodes: CanvasNodeData[]) {
    return nodes.flatMap((node) => {
        const text = node.type === CanvasNodeType.Text ? node.metadata?.content : node.metadata?.prompt;
        return text?.trim() ? [`${node.title}：\n${text.trim()}`] : [];
    });
}
