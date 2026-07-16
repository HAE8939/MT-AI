import { pollRunningHubTask, submitRunningHubTask } from "@/services/providers/runninghub";
import { registerWorkflowTaskExecutor } from "@/hooks/use-workflow-task-runner";
import { useConfigStore } from "@/stores/use-config-store";
import type { RunningHubTaskParams } from "@/types/ai-workflow";

// RunningHub 执行器：把智能体模块的云工作流任务接入统一任务运行时（提交 → 5s 轮询 → 结果回写）。

function runninghubConfig() {
    const { runninghub } = useConfigStore.getState();
    if (!runninghub.apiKey.trim()) throw new Error("请先在配置页填写 RunningHub API Key");
    return { baseUrl: runninghub.baseUrl || "https://www.runninghub.cn", apiKey: runninghub.apiKey };
}

export function registerRunningHubExecutor() {
    registerWorkflowTaskExecutor("runninghub", {
        submit: async (task, signal) => {
            const params = task.params as RunningHubTaskParams;
            try {
                const externalTaskId = await submitRunningHubTask(runninghubConfig(), params.workflowId, params.nodeInfoList, signal);
                return { status: "polling", externalTaskId };
            } catch (error) {
                return { status: "failed", error: error instanceof Error ? error.message : "任务提交失败" };
            }
        },
        poll: async (task, externalTaskId, signal) => {
            const state = await pollRunningHubTask(runninghubConfig(), externalTaskId, signal);
            if (!state.final) return { status: "polling" };
            if (state.failed) return { status: "failed", error: state.error };
            return { status: "succeeded", resultUrls: state.resultUrls || [] };
        },
    });
}
