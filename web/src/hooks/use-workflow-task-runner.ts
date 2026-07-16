import { useEffect } from "react";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import type { AiWorkflowTask } from "@/types/ai-workflow";

const runningTasks = new Map<string, AbortController>();
const POLL_INTERVAL_MS = 5000;
const POLL_DEADLINE_MS = 30 * 60 * 1000;

/** 任务执行器：由各 Provider 注册提交/轮询实现（阶段 2 填充） */
export type WorkflowTaskExecutor = {
    submit: (task: AiWorkflowTask, signal: AbortSignal) => Promise<{ status: "polling" | "succeeded" | "failed"; externalTaskId?: string; resultUrls?: string[]; error?: string }>;
    poll: (task: AiWorkflowTask, externalTaskId: string, signal: AbortSignal) => Promise<{ status: "polling" | "succeeded" | "failed"; resultUrls?: string[]; progress?: number; error?: string }>;
};

const taskExecutors = new Map<string, WorkflowTaskExecutor>();

export function registerWorkflowTaskExecutor(type: string, executor: WorkflowTaskExecutor) {
    taskExecutors.set(type, executor);
}

export function useWorkflowTaskRunner() {
    const hydrated = useWorkflowTaskStore((state) => state.hydrated);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const tasks = useWorkflowTaskStore((state) => state.tasks);

    useEffect(() => {
        if (!hydrated || !canvasHydrated) return;
        tasks.forEach((task) => {
            if (task.type === "image-generation") return;
            if (!taskExecutors.has(task.type)) return;
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
    const executor = taskExecutors.get(task.type);
    if (!executor) return taskStore.updateTask(task.id, { status: "failed", error: "没有可用的任务执行器" });
    try {
        let externalTaskId = task.externalTaskId;
        if (!externalTaskId) {
            taskStore.updateTask(task.id, { status: "submitting", error: undefined });
            const submitted = await executor.submit(task, signal);
            if (submitted.status === "failed") return taskStore.updateTask(task.id, { status: "failed", error: submitted.error || "任务提交失败" });
            if (submitted.status === "succeeded") return taskStore.updateTask(task.id, { status: "succeeded", resultUrls: submitted.resultUrls || [], externalTaskId: submitted.externalTaskId });
            externalTaskId = submitted.externalTaskId;
            if (!externalTaskId) return taskStore.updateTask(task.id, { status: "failed", error: "任务提交后未返回 ID" });
            taskStore.updateTask(task.id, { status: "polling", externalTaskId });
        }
        const deadline = Date.now() + POLL_DEADLINE_MS;
        while (!signal.aborted && Date.now() < deadline) {
            const result = await executor.poll(task, externalTaskId, signal);
            if (result.status === "succeeded") return taskStore.updateTask(task.id, { status: "succeeded", resultUrls: result.resultUrls || [], progress: 100 });
            if (result.status === "failed") return taskStore.updateTask(task.id, { status: "failed", error: result.error || "任务执行失败" });
            if (result.progress != null) taskStore.updateTask(task.id, { progress: result.progress });
            await wait(POLL_INTERVAL_MS, signal);
        }
        if (!signal.aborted) taskStore.updateTask(task.id, { status: "failed", error: "任务轮询超时" });
    } catch (error) {
        if (signal.aborted) return;
        taskStore.updateTask(task.id, { status: "failed", error: requestErrorMessage(error) });
    }
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
    return "任务请求失败";
}
