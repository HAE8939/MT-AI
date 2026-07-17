import { useMemo, useState } from "react";
import { App, Button, Empty, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { Cloud, LayoutTemplate, Play, SlidersHorizontal } from "lucide-react";
import { nanoid } from "nanoid";

import { canvasThemes } from "@/lib/canvas-theme";
import { useAgentTemplateStore } from "@/stores/use-agent-template-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { RunningHubRunDialog } from "@/components/workflow/runninghub-run-dialog";
import { WorkflowTaskList } from "@/components/layout/workflow-task-drawer";
import type { AgentTemplate } from "@/types/workflow";

// 面板「工作流」tab：快速运行已登记的 RunningHub 云工作流 / 画布模板，并跟踪任务进度。
// 模板的登记与管理在 /workflows 页面。

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

export function CanvasWorkflowTab({ theme }: { theme: Theme }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const templates = useAgentTemplateStore((state) => state.templates);
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const [runTarget, setRunTarget] = useState<AgentTemplate | null>(null);

    const workflows = useMemo(() => templates.filter((item) => item.spec.kind !== "doc-analysis"), [templates]);
    const currentProjectId = canvasContext?.snapshot.projectId || "";

    const insertCanvasTemplate = (template: AgentTemplate) => {
        if (template.spec.kind !== "canvas") return;
        const spec = template.spec;
        const targetProjectId = currentProjectId || projects[0]?.id || createProject(`${template.name}`);
        const project = useCanvasStore.getState().projects.find((item) => item.id === targetProjectId);
        if (!project) return;
        const idMap = new Map(spec.nodes.map((node) => [node.id, nanoid()]));
        const offsetX = 120 + (project.nodes.length ? Math.max(...project.nodes.map((node) => node.position.x + node.width)) : 0);
        const nodes = spec.nodes.map((node) => ({ ...node, id: idMap.get(node.id)!, position: { x: node.position.x + offsetX, y: node.position.y + 120 } }));
        const connections = spec.connections.map((connection) => ({ id: nanoid(), fromNodeId: idMap.get(connection.fromNodeId)!, toNodeId: idMap.get(connection.toNodeId)! }));
        updateProject(targetProjectId, { nodes: [...project.nodes, ...nodes], connections: [...project.connections, ...connections] });
        message.success("模板已插入画布，填充输入节点后即可运行");
        if (targetProjectId !== currentProjectId) navigate(`/canvas/${targetProjectId}`);
    };

    const startRun = (template: AgentTemplate) => {
        if (template.spec.kind === "runninghub") setRunTarget(template);
        else insertCanvasTemplate(template);
    };

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm" style={{ color: theme.node.muted }}>
                        {workflows.length ? `${workflows.length} 个工作流` : "暂无工作流"}
                    </div>
                    <Button size="small" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => navigate("/workflows")}>
                        管理工作流
                    </Button>
                </div>
                <div className="space-y-2">
                    {workflows.map((template) => {
                        const cloud = template.spec.kind === "runninghub";
                        return (
                            <div key={template.id} className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                <div className="flex items-center gap-2">
                                    <span className="grid size-8 shrink-0 place-items-center rounded-lg text-base" style={{ background: theme.toolbar.panel }}>{template.avatar || "🧩"}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <div className="truncate text-sm font-medium leading-5">{template.name}</div>
                                            <Tag className="m-0 shrink-0 border-0 px-1.5 text-[10px] leading-4" icon={cloud ? <Cloud className="mr-0.5 inline size-3" /> : <LayoutTemplate className="mr-0.5 inline size-3" />}>
                                                {cloud ? "云工作流" : "画布模板"}
                                            </Tag>
                                        </div>
                                        <div className="truncate text-[11px] leading-4 opacity-65">{template.description || "暂无说明"}</div>
                                    </div>
                                    <Button size="small" type="primary" className="!h-7 shrink-0" icon={<Play className="size-3.5" />} onClick={() => startRun(template)}>
                                        运行
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                    {!workflows.length ? (
                        <div className="py-6">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-xs">还没有登记工作流，去「管理工作流」登记 RunningHub 云工作流，或在画布中保存模板</span>} />
                        </div>
                    ) : null}
                </div>
                <div className="border-t pt-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="mb-2 text-sm font-medium" style={{ color: theme.node.text }}>任务进度</div>
                    <WorkflowTaskList />
                </div>
            </div>
            <RunningHubRunDialog template={runTarget} defaultProjectId={currentProjectId || undefined} onClose={() => setRunTarget(null)} />
        </div>
    );
}
