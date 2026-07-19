import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";

import { useAgentStore } from "@/stores/use-agent-store";
import { useConfigStore } from "@/stores/use-config-store";
import { uploadImage } from "@/services/image-storage";
import { runPromptEngineWorkflow, validateRunInput } from "@/services/prompt-engine/workflow-runner";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import type { AgentTemplate, PromptEngineSpec } from "@/types/workflow";

// 提示词引擎工作流运行：收集输入（原图/蒙版/参考图/文字/选项）→ LLM 扩写 → 生图 →
// 结果作为图片节点写入当前画布，metadata.prompt 保存 final_prompt 供回溯调优。

/** 图片大小上限 10MB：防止第三方 API 因图片过大处理失败 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** dataUrl 长度近似折算为字节数（base64 膨胀 ~4/3），超过上限则抛错 */
function checkDataUrlSize(dataUrl: string, label: string) {
    const approxBytes = (dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75;
    if (approxBytes > MAX_IMAGE_BYTES) throw new Error(`${label}超过 10MB，请压缩后再提交`);
}

type SlotFile = { file: File; previewUrl: string; dataUrl: string };

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
    });
}

export function usePromptEngineRun(template: AgentTemplate | null) {
    const { message } = App.useApp();
    const aiConfig = useConfigStore((state) => state.config);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const spec = template?.spec.kind === "prompt-engine" ? (template.spec as PromptEngineSpec) : null;
    const config = spec?.config || null;

    const [sourceImage, setSourceImage] = useState<SlotFile | null>(null);
    const [sourceFromCanvas, setSourceFromCanvas] = useState<string>("");
    const [maskImage, setMaskImage] = useState<SlotFile | null>(null);
    const [refImages, setRefImages] = useState<SlotFile[]>([]);
    const [userText, setUserText] = useState("");
    const [extraValues, setExtraValues] = useState<Record<string, string | number>>({});
    const [running, setRunning] = useState(false);
    const [phase, setPhase] = useState<"expanding" | "generating" | null>(null);
    const [finalPrompt, setFinalPrompt] = useState("");
    const [lastError, setLastError] = useState("");
    const revokeRef = useRef<string[]>([]);

    useEffect(() => {
        revokeRef.current.forEach((url) => URL.revokeObjectURL(url));
        revokeRef.current = [];
        setSourceImage(null);
        setSourceFromCanvas("");
        setMaskImage(null);
        setRefImages([]);
        setUserText("");
        // 额外表单项回填默认值
        const defaults: Record<string, string | number> = {};
        for (const field of config?.inputSpec.extraFields || []) {
            if (field.default !== undefined) defaults[field.key] = field.default;
        }
        setExtraValues(defaults);
        setRunning(false);
        setPhase(null);
        setFinalPrompt("");
        setLastError("");
    }, [template?.id, config]);

    useEffect(() => () => revokeRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

    const canvasImageNodes = useMemo(() => {
        const nodes = canvasContext?.snapshot.nodes || [];
        return nodes.filter((node) => node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
    }, [canvasContext?.snapshot.nodes]);

    const makeSlotFile = async (file: File): Promise<SlotFile> => {
        if (file.size > MAX_IMAGE_BYTES) throw new Error(`图片超过 10MB，请压缩后再试`);
        const previewUrl = URL.createObjectURL(file);
        revokeRef.current.push(previewUrl);
        return { file, previewUrl, dataUrl: await readFileAsDataUrl(file) };
    };

    const pickSourceFile = async (file: File) => {
        try {
            setSourceImage(await makeSlotFile(file));
            setSourceFromCanvas("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片读取失败");
        }
    };
    const pickMaskFile = async (file: File) => {
        try {
            setMaskImage(await makeSlotFile(file));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片读取失败");
        }
    };

    const addReferenceFile = async (file: File) => {
        try {
            const slot = await makeSlotFile(file);
            setRefImages((current) => [...current, slot]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片读取失败");
        }
    };
    const removeReference = (index: number) => setRefImages((current) => current.filter((_, i) => i !== index));

    const setExtraValue = (key: string, value: string | number) => setExtraValues((current) => ({ ...current, [key]: value }));

    const run = async (): Promise<boolean> => {
        if (!template || !config) return false;
        if (!isAiConfigReady(aiConfig, aiConfig.imageModel || aiConfig.model)) {
            openConfigDialog(true);
            return false;
        }
        // 画布图片节点的 content 可能是 blob/远程 URL，统一转 dataUrl
        let sourceDataUrl = sourceImage?.dataUrl || "";
        if (!sourceDataUrl && sourceFromCanvas) {
            const { imageToDataUrl } = await import("@/services/image-storage");
            const node = canvasImageNodes.find((item) => item.metadata?.content === sourceFromCanvas);
            sourceDataUrl = (await imageToDataUrl({ url: sourceFromCanvas, storageKey: node?.metadata?.storageKey })) || "";
        }
        // 提交前校验所有图片大小（本地图已在 makeSlotFile 时检查，画布图需在解析后检查）
        if (sourceDataUrl) checkDataUrlSize(sourceDataUrl, "原图");
        if (maskImage?.dataUrl) checkDataUrlSize(maskImage.dataUrl, "蒙版图");
        refImages.forEach((item, i) => checkDataUrlSize(item.dataUrl, `参考图 ${i + 1}`));
        const input = {
            image: sourceDataUrl || undefined,
            mask: maskImage?.dataUrl,
            refImages: refImages.map((item) => item.dataUrl),
            userText: userText.trim() || undefined,
            extraFields: Object.keys(extraValues).length ? extraValues : undefined,
        };
        const invalid = validateRunInput(config, input);
        if (invalid) {
            message.warning(invalid);
            return false;
        }
        setRunning(true);
        setLastError("");
        setFinalPrompt("");
        try {
            const result = await runPromptEngineWorkflow(aiConfig, config, input, { onPhase: setPhase });
            setFinalPrompt(result.finalPrompt);

            // 结果写入画布：每张结果图一个图片节点（无画布上下文时仅提示成功）
            const context = useAgentStore.getState().canvasContext;
            if (context?.applyOps) {
                const baseX = 120;
                const baseY = 120;
                const ops: CanvasAgentOp[] = [];
                for (let i = 0; i < result.images.length; i++) {
                    const uploaded = await uploadImage(result.images[i].dataUrl, { fileName: `${config.meta.id}-${i + 1}.png` });
                    ops.push({
                        type: "add_node",
                        nodeType: CanvasNodeType.Image,
                        title: `${template.name}${result.images.length > 1 ? ` ${i + 1}` : ""}`,
                        position: { x: baseX + i * 400, y: baseY },
                        metadata: { content: uploaded.url, storageKey: uploaded.storageKey, prompt: result.finalPrompt, status: "success" },
                    });
                }
                context.applyOps(ops);
                message.success("生成完成，结果已写入画布（节点已保存扩写提示词）");
            } else {
                message.success("生成完成");
            }
            return true;
        } catch (error) {
            const text = error instanceof Error ? error.message : "工作流运行失败";
            setLastError(text);
            message.error(text);
            return false;
        } finally {
            setRunning(false);
            setPhase(null);
        }
    };

    return {
        config,
        sourceImage,
        sourceFromCanvas,
        setSourceFromCanvas,
        pickSourceFile,
        maskImage,
        pickMaskFile,
        setMaskImage,
        refImages,
        addReferenceFile,
        removeReference,
        userText,
        setUserText,
        extraValues,
        setExtraValue,
        canvasImageNodes,
        running,
        phase,
        finalPrompt,
        lastError,
        run,
    };
}
