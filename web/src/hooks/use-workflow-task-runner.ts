import { useEffect } from "react";

import { pollBizyAirWorkflow, submitBizyAirWorkflow } from "@/services/api/bizyair-workflows";
import { imageToDataUrl } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import type { AiWorkflowTask, DrawingRenderParams, MultiAngleParams, UpscaleWorkflowParams } from "@/types/ai-workflow";

const runningTasks = new Map<string, AbortController>();
const POLL_INTERVAL_MS = 5000;
const POLL_DEADLINE_MS = 30 * 60 * 1000;

export function useWorkflowTaskRunner() {
    const hydrated = useWorkflowTaskStore((state) => state.hydrated);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const tasks = useWorkflowTaskStore((state) => state.tasks);

    useEffect(() => {
        if (!hydrated || !canvasHydrated) return;
        tasks.forEach((task) => {
            if (!["queued", "submitting", "polling"].includes(task.status) || runningTasks.has(task.id)) return;
            const controller = new AbortController();
            runningTasks.set(task.id, controller);
            void runTask(task, controller.signal).finally(() => runningTasks.delete(task.id));
        });
        runningTasks.forEach((controller, id) => {
            const task = tasks.find((item) => item.id === id);
            if (!task || task.status === "cancelled") controller.abort();
        });
    }, [canvasHydrated, hydrated, tasks]);
}

async function runTask(task: AiWorkflowTask, signal: AbortSignal) {
    const taskStore = useWorkflowTaskStore.getState();
    const config = useConfigStore.getState().workflowConfig.bizyair;
    if (!config.baseUrl.trim() || !config.apiKey.trim()) return taskStore.updateTask(task.id, { status: "failed", error: "请先配置 BizyAir 专业工作流" });
    try {
        let externalTaskId = task.externalTaskId;
        if (!externalTaskId) {
            taskStore.updateTask(task.id, { status: "submitting", error: undefined });
            const input = await buildWorkflowInput(task);
            const submitted = await submitBizyAirWorkflow(config, input, signal);
            if (submitted.status === "failed") return taskStore.updateTask(task.id, { status: "failed", error: submitted.error || "任务提交失败" });
            if (submitted.status === "succeeded") return taskStore.updateTask(task.id, { status: "succeeded", resultUrls: submitted.resultUrls, externalTaskId: submitted.externalTaskId });
            externalTaskId = submitted.externalTaskId;
            if (!externalTaskId) return taskStore.updateTask(task.id, { status: "failed", error: "任务提交后未返回 ID" });
            taskStore.updateTask(task.id, { status: "polling", externalTaskId });
        }
        const deadline = Date.now() + POLL_DEADLINE_MS;
        while (!signal.aborted && Date.now() < deadline) {
            const result = await pollBizyAirWorkflow(config, externalTaskId, signal);
            if (result.status === "succeeded") return taskStore.updateTask(task.id, { status: "succeeded", resultUrls: result.resultUrls });
            if (result.status === "failed") return taskStore.updateTask(task.id, { status: "failed", error: result.error || "任务执行失败" });
            await wait(POLL_INTERVAL_MS, signal);
        }
        if (!signal.aborted) taskStore.updateTask(task.id, { status: "failed", error: "任务轮询超时" });
    } catch (error) {
        if (signal.aborted) return;
        taskStore.updateTask(task.id, { status: "failed", error: requestErrorMessage(error) });
    }
}

async function buildWorkflowInput(task: AiWorkflowTask) {
    const project = useCanvasStore.getState().projects.find((item) => item.id === task.projectId);
    const source = project?.nodes.find((node) => node.id === task.sourceNodeId);
    if (!project || !source?.metadata?.content) throw new Error("源画布或图片节点已不存在");
    const sourceImage = await imageToDataUrl({ storageKey: source.metadata.storageKey, url: source.metadata.content });
    if (!sourceImage) throw new Error("无法读取源图片");
    if (task.type === "drawing-render") {
        const params = task.params as DrawingRenderParams;
        const reference = params.referenceNodeId ? project.nodes.find((node) => node.id === params.referenceNodeId) : source;
        const referenceImage = reference?.metadata?.content ? await imageToDataUrl({ storageKey: reference.metadata.storageKey, url: reference.metadata.content }) : sourceImage;
        return { type: "drawing-render" as const, sourceImage, referenceImage: referenceImage || sourceImage, params };
    }
    if (task.type === "multi-angle") return { type: "multi-angle" as const, sourceImage, params: task.params as MultiAngleParams };
    return { type: "upscale" as const, sourceImage, params: task.params as UpscaleWorkflowParams };
}

function wait(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}

function requestErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return "专业工作流请求失败";
}
