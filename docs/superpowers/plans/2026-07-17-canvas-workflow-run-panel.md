# 画布侧栏 RunningHub 式运行面板 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把画布侧栏「工作流」tab 的云工作流运行体验改造为 RunningHub 式内嵌面板：列表↔运行视图切换、图片双来源（画布节点+本地上传）、数值步进器参数、结果写回画布占位节点。

**Architecture:** 从现有运行弹窗抽出共享 hook `useRunningHubRun`（字段状态/图片解析上传/入队/占位节点），弹窗与新侧栏面板共同消费；侧栏 tab 内部用 `activeTemplate` 状态切换列表/运行两个视图。

**Tech Stack:** Vite + React 19 + TypeScript + antd 6 + zustand + Tailwind 4；RunningHub OpenAPI v2（已迁移完成）。

**Spec:** `docs/superpowers/specs/2026-07-17-canvas-workflow-run-panel-design.md`

## Global Constraints

- 仓库无单元测试框架（package.json 无 test 脚本），每任务的测试环节 = `npm run typecheck`（在 `web/` 下执行）+ 浏览器实测（dev server，端口 3000 被占时用备用配置 3210）。
- UI 文案全部中文；代码注释风格遵循仓库惯例：文件头一行行为注释 + 仅关键约束处注释。
- 格式：4 空格缩进、双引号、行宽宽松（prettier 配置已存在，提交前可跑 `npm run format`）。
- `/workflows` 页运行弹窗**交互不变**（仅内部重构为消费 hook + 补数值字段渲染）；侧栏面板**不提供 URL 输入**，但 hook 保留 URL 透传逻辑供弹窗使用。
- 明确不做：JSON 导入自动识别数值、min/max/step 配置、多输出全部上画布、视频写回修复。
- git 提交信息末尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 参数类型扩展（number）+ 登记弹窗数值选项

**Files:**
- Modify: `web/src/types/workflow.ts:7-16`（RunningHubParamField）
- Modify: `web/src/pages/workflows/index.tsx:218`（参数行类型 Select）

**Interfaces:**
- Produces: `RunningHubParamField.kind` 联合类型变为 `"text" | "image" | "number"`，后续任务的表单渲染按此三分支。

- [ ] **Step 1: 扩展类型定义**

`web/src/types/workflow.ts` 中把：

```ts
    /** text=文本输入；image=图片输入（公网 URL 或经 RunningHub 上传） */
    kind: "text" | "image";
```

改为：

```ts
    /** text=文本输入；image=图片输入（画布节点/本地上传/公网 URL，均在提交时解析）；number=数值步进器 */
    kind: "text" | "image" | "number";
```

- [ ] **Step 2: 登记弹窗类型下拉加「数值」**

`web/src/pages/workflows/index.tsx` 参数行的 Select（约 L218）把：

```tsx
<Select value={field.kind} options={[{ value: "text", label: "文本" }, { value: "image", label: "图片" }]} onChange={(kind) => setFields((current) => current.map((item, i) => (i === index ? { ...item, kind } : item)))} />
```

改为：

```tsx
<Select value={field.kind} options={[{ value: "text", label: "文本" }, { value: "image", label: "图片" }, { value: "number", label: "数值" }]} onChange={(kind) => setFields((current) => current.map((item, i) => (i === index ? { ...item, kind } : item)))} />
```

- [ ] **Step 3: 类型检查**

Run: `cd web && npm run typecheck`
Expected: 无错误（number 字段在运行弹窗暂时落入 TextArea 分支，类型合法，Task 2 补专属渲染）。

- [ ] **Step 4: 浏览器验证**

dev server 打开 `/workflows` → 「登记 RunningHub 工作流」→ 参数行类型下拉应有 文本/图片/数值 三项；选「数值」保存的模板 spec 中 kind 为 `"number"`。

- [ ] **Step 5: Commit**

```bash
git add web/src/types/workflow.ts web/src/pages/workflows/index.tsx
git commit -m "feat(workflow): RunningHub 参数类型新增数值(number)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 抽共享运行 hook + 弹窗重构

**Files:**
- Create: `web/src/components/workflow/use-runninghub-run.ts`
- Modify: `web/src/components/workflow/runninghub-run-dialog.tsx`（整文件重构）

**Interfaces:**
- Consumes: Task 1 的 `kind: "text" | "image" | "number"`；现有 `uploadRunningHubFile(config, blob, fileName, signal?)`、`useWorkflowTaskStore.enqueueTask`、`getImageBlob(storageKey)`。
- Produces（Task 3 依赖，签名必须一致）:

```ts
export type RunningHubLocalFile = { file: File; previewUrl: string };
export function useRunningHubRun(template: AgentTemplate | null, options?: { defaultProjectId?: string }): {
    spec: RunningHubSpec | null;
    values: Record<string, string>;
    setValue: (index: number, value: string) => void;      // 互斥：设置后清除同下标 localFile
    localFiles: Record<number, RunningHubLocalFile>;
    setLocalFile: (index: number, file: File | null) => void; // 互斥：设置后清除同下标 values
    canvasImageNodes: CanvasNodeData[];                     // 当前画布全部图片节点
    projects: ReturnType<typeof useCanvasStore.getState>["projects"]; // useCanvasStore 的 projects 直传（类型由推断得出，无需显式标注）
    projectId: string;
    setProjectId: (id: string) => void;
    uploading: boolean;
    lastTaskId: string | null;                              // 本 hook 实例最近一次成功提交的任务 id
    run: () => Promise<boolean>;                            // true=已提交入队
};
```

- [ ] **Step 1: 新建 hook（完整实现）**

`web/src/components/workflow/use-runninghub-run.ts`：

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { getImageBlob } from "@/services/image-storage";
import { RUNNINGHUB_BASE_URL, uploadRunningHubFile, type RunningHubNodeInfo } from "@/services/providers/runninghub";
import { CanvasNodeType } from "@/types/canvas";
import type { AgentTemplate, RunningHubSpec } from "@/types/workflow";

// RunningHub 工作流运行共享逻辑：字段状态（含本地文件）→ 提交时解析上传 → 入队统一任务运行时 + 画布占位节点。
// 运行弹窗（/workflows 页）与画布侧栏运行面板共同消费；同一下标的 values 与 localFiles 互斥。

export type RunningHubLocalFile = { file: File; previewUrl: string };

export function useRunningHubRun(template: AgentTemplate | null, options?: { defaultProjectId?: string }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const enqueueTask = useWorkflowTaskStore((state) => state.enqueueTask);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const runninghub = useConfigStore((state) => state.runninghub);
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const [values, setValues] = useState<Record<string, string>>({});
    const [localFiles, setLocalFiles] = useState<Record<number, RunningHubLocalFile>>({});
    const [projectId, setProjectId] = useState("");
    const [uploading, setUploading] = useState(false);
    const [lastTaskId, setLastTaskId] = useState<string | null>(null);
    /** 每次切换模板递增，令仍在上传中的旧 run() 作废，避免取消后任务仍被提交 */
    const runSessionRef = useRef(0);
    const localFilesRef = useRef(localFiles);
    localFilesRef.current = localFiles;
    const spec = template?.spec.kind === "runninghub" ? (template.spec as RunningHubSpec) : null;

    useEffect(() => {
        runSessionRef.current += 1;
        Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setValues({});
        setLocalFiles({});
        setProjectId("");
        setUploading(false);
        setLastTaskId(null);
    }, [template?.id]);

    useEffect(() => () => Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

    const canvasImageNodes = useMemo(() => {
        const nodes = canvasContext?.snapshot.nodes || [];
        return nodes.filter((node) => node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
    }, [canvasContext?.snapshot.nodes]);

    const setValue = (index: number, value: string) => {
        setValues((current) => ({ ...current, [`${index}`]: value }));
        setLocalFiles((current) => {
            if (!current[index]) return current;
            URL.revokeObjectURL(current[index].previewUrl);
            const next = { ...current };
            delete next[index];
            return next;
        });
    };

    const setLocalFile = (index: number, file: File | null) => {
        setLocalFiles((current) => {
            if (current[index]) URL.revokeObjectURL(current[index].previewUrl);
            const next = { ...current };
            if (file) next[index] = { file, previewUrl: URL.createObjectURL(file) };
            else delete next[index];
            return next;
        });
        if (file) setValues((current) => ({ ...current, [`${index}`]: "" }));
    };

    const uploadConfig = () => ({ baseUrl: runninghub.baseUrl.trim() || RUNNINGHUB_BASE_URL, apiKey: runninghub.apiKey });

    /** 把 image 字段的字符串值解析成 RunningHub 可用的 fieldValue：公网 URL 与已上传的 fileName 透传，画布本地图上传换 fileName */
    const resolveImageFieldValue = async (raw: string) => {
        if (/^https?:\/\//.test(raw)) return raw;
        const node = canvasImageNodes.find((item) => item.metadata?.content === raw);
        const isLocalUrl = raw.startsWith("blob:") || raw.startsWith("data:");
        if (!node && !isLocalUrl) return raw;
        const storageKey = node?.metadata?.storageKey;
        let blob: Blob | null = null;
        try {
            blob = storageKey ? await getImageBlob(storageKey) : null;
            if (!blob && isLocalUrl) blob = await (await fetch(raw)).blob();
        } catch {
            blob = null;
        }
        if (!blob) throw new Error("读取画布图片失败，请重新选择图片");
        const extension = (blob.type.split("/")[1] || "png").replace("+xml", "");
        return uploadRunningHubFile(uploadConfig(), blob, `canvas-input.${extension}`);
    };

    const run = async (): Promise<boolean> => {
        if (!template || !spec) return false;
        if (!runninghub.apiKey.trim()) {
            message.warning("请先在登记弹窗或配置中填写 RunningHub API Key");
            return false;
        }
        const session = runSessionRef.current;
        setUploading(true);
        let nodeInfoList: RunningHubNodeInfo[];
        let promptText: string;
        try {
            const resolved = await Promise.all(
                spec.fields.map(async (field, index) => {
                    const local = field.kind === "image" ? localFiles[index] : undefined;
                    const raw = (values[`${index}`] ?? field.defaultValue ?? "").trim();
                    if (!local && !raw) return null;
                    const fieldValue = field.kind === "image" ? (local ? await uploadRunningHubFile(uploadConfig(), local.file, local.file.name || "upload.png") : await resolveImageFieldValue(raw)) : raw;
                    return { field, raw: local ? local.file.name : raw, info: { nodeId: field.nodeId, fieldName: field.fieldName, fieldValue } };
                }),
            );
            const entries = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
            nodeInfoList = entries.map((item) => item.info);
            promptText = entries.filter((item) => item.field.kind === "text").map((item) => item.raw).join(" / ");
        } catch (error) {
            if (session !== runSessionRef.current) return false;
            const detail = error instanceof Error ? error.message : "";
            message.error(/[一-鿿]/.test(detail) ? detail : `图片上传失败${detail ? `：${detail}` : "，请稍后重试"}`);
            setUploading(false);
            return false;
        }
        if (session !== runSessionRef.current) return false;
        setUploading(false);
        const targetProjectId = projectId || options?.defaultProjectId || projects[0]?.id || createProject(`${template.name} 运行结果`);
        const project = useCanvasStore.getState().projects.find((item) => item.id === targetProjectId);
        if (!project) return false;
        const childId = nanoid();
        const taskId = enqueueTask({
            projectId: targetProjectId,
            sourceNodeId: childId,
            targetNodeIds: [childId],
            type: "runninghub",
            params: { workflowId: spec.workflowId, nodeInfoList, agentTemplateId: template.id },
            prompt: promptText || template.name,
        });
        const isVideo = template.category === "video";
        updateProject(targetProjectId, {
            nodes: [
                ...project.nodes,
                {
                    id: childId,
                    type: isVideo ? CanvasNodeType.Video : CanvasNodeType.Image,
                    title: template.name,
                    position: { x: 120, y: 120 + project.nodes.length * 24 },
                    width: 320,
                    height: 240,
                    metadata: { prompt: promptText, status: "loading", workflowTaskId: taskId, workflowType: "runninghub", workflowResultIndex: 0 },
                },
            ],
        });
        setLastTaskId(taskId);
        message.success("任务已提交，结果将写回画布节点");
        navigate(`/canvas/${targetProjectId}?focus=${encodeURIComponent(childId)}`);
        return true;
    };

    return { spec, values, setValue, localFiles, setLocalFile, canvasImageNodes, projects, projectId, setProjectId, uploading, lastTaskId, run };
}
```

- [ ] **Step 2: 重构运行弹窗为消费 hook**

`web/src/components/workflow/runninghub-run-dialog.tsx` 整文件替换为：

```tsx
import { useMemo } from "react";
import { AutoComplete, Form, Input, InputNumber, Modal, Select } from "antd";

import { useRunningHubRun } from "@/components/workflow/use-runninghub-run";
import type { AgentTemplate } from "@/types/workflow";

// 运行 RunningHub 工作流的弹窗（/workflows 页）：填参数 → 提交统一任务运行时 → 结果写回画布新节点。
// 核心逻辑在 useRunningHubRun；图片参数可选画布图片节点或直接填公网 URL（AutoComplete 自由输入保留 URL 能力）。

export function RunningHubRunDialog({ template, defaultProjectId, onClose }: { template: AgentTemplate | null; defaultProjectId?: string; onClose: () => void }) {
    const { spec, values, setValue, canvasImageNodes, projects, projectId, setProjectId, uploading, run } = useRunningHubRun(template, { defaultProjectId });
    const canvasImageOptions = useMemo(() => canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id })), [canvasImageNodes]);

    const submit = async () => {
        if (await run()) onClose();
    };

    return (
        <Modal
            title={template ? `运行：${template.name}` : ""}
            open={Boolean(template)}
            onCancel={onClose}
            onOk={() => void submit()}
            okText={uploading ? "上传图片中…" : "运行"}
            okButtonProps={{ loading: uploading }}
            cancelText="取消"
            width={640}
            destroyOnHidden
        >
            {spec ? (
                <div className="space-y-4 pt-1">
                    <Form layout="vertical" requiredMark={false}>
                        {spec.fields.map((field, index) => (
                            <Form.Item key={index} label={field.label} className="mb-3">
                                {field.kind === "image" ? (
                                    <AutoComplete
                                        className="w-full"
                                        options={canvasImageOptions}
                                        value={values[`${index}`] || ""}
                                        placeholder={canvasImageOptions.length ? "选择画布图片，或填写图片公网 URL" : "图片公网 URL（COS 直链或其他可公开访问地址）"}
                                        onChange={(value) => setValue(index, value)}
                                    />
                                ) : field.kind === "number" ? (
                                    <InputNumber className="w-full" placeholder={field.defaultValue || "填写数值"} value={values[`${index}`] ? Number(values[`${index}`]) : null} onChange={(value) => setValue(index, value === null || value === undefined ? "" : String(value))} />
                                ) : (
                                    <Input.TextArea rows={2} placeholder={field.defaultValue || "填写内容"} value={values[`${index}`] || ""} onChange={(event) => setValue(index, event.target.value)} />
                                )}
                            </Form.Item>
                        ))}
                        <Form.Item label="结果写入画布" className="mb-0">
                            <Select
                                placeholder={defaultProjectId ? "默认当前画布" : projects.length ? "选择画布（默认第一个）" : "将自动新建画布"}
                                allowClear
                                value={projectId || undefined}
                                options={projects.map((project) => ({ value: project.id, label: project.title }))}
                                onChange={(value) => setProjectId(value || "")}
                            />
                        </Form.Item>
                    </Form>
                </div>
            ) : null}
        </Modal>
    );
}
```

说明：原弹窗内的 `resolveImageFieldValue`、`run`、session 作废、状态清理全部移入 hook；弹窗关闭时 `template` 变为 null 触发 hook 的模板切换清理，与原 `useEffect` 行为一致。

- [ ] **Step 3: 类型检查**

Run: `cd web && npm run typecheck`
Expected: 无错误。

- [ ] **Step 4: 浏览器验证（弹窗行为不回归）**

dev server 打开 `/workflows`：
1. 点 Z Image 内置模板「运行」→ 弹窗打开，无参数字段，仅「结果写入画布」；
2. 未配 Key 点「运行」→ 提示「请先在登记弹窗或配置中填写 RunningHub API Key」，弹窗不关闭；
3. 登记一个含 数值 参数的临时模板 → 运行弹窗中该字段渲染为 InputNumber 步进器；验证后删除临时模板。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/workflow/use-runninghub-run.ts web/src/components/workflow/runninghub-run-dialog.tsx
git commit -m "refactor(workflow): 抽取 useRunningHubRun 共享运行 hook，弹窗补数值字段渲染

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 侧栏运行视图组件 + tab 视图切换

**Files:**
- Create: `web/src/components/canvas/canvas-workflow-run-panel.tsx`
- Modify: `web/src/components/canvas/canvas-workflow-tab.tsx`

**Interfaces:**
- Consumes: Task 2 的 `useRunningHubRun(template, { defaultProjectId })` 全部返回值（签名见 Task 2）；`useWorkflowTaskStore` 的 `tasks`（按 `lastTaskId` 查任务）；tab 现有 `theme: Theme`（`canvasThemes` 值类型）。
- Produces: `export function CanvasWorkflowRunPanel({ template, theme, currentProjectId, onBack }: { template: AgentTemplate; theme: Theme; currentProjectId?: string; onBack: () => void })`。

- [ ] **Step 1: 新建运行视图组件（完整实现）**

`web/src/components/canvas/canvas-workflow-run-panel.tsx`：

```tsx
import { useEffect, useMemo } from "react";
import { App, Button, Input, InputNumber, Select, Tag, Upload } from "antd";
import { ArrowLeft, Cloud, ImagePlus, Play } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useRunningHubRun } from "@/components/workflow/use-runninghub-run";
import { useAgentStore } from "@/stores/use-agent-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import { CanvasNodeType } from "@/types/canvas";
import type { AiWorkflowStatus } from "@/types/ai-workflow";
import type { AgentTemplate } from "@/types/workflow";

// 画布侧栏的 RunningHub 式运行视图：图片双来源（画布节点/本地上传）+ 数值步进器 + 底部大按钮。
// 提交后停留本视图，底部状态条跟踪最近任务；结果照旧写回画布占位节点。图片不提供 URL 输入（弹窗保留该能力）。

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

const STATUS_LABELS: Record<AiWorkflowStatus, string> = {
    queued: "排队中",
    submitting: "提交中",
    polling: "运行中",
    running: "运行中",
    succeeded: "已完成，结果已写回画布",
    failed: "失败",
    cancelled: "已取消",
};

export function CanvasWorkflowRunPanel({ template, theme, currentProjectId, onBack }: { template: AgentTemplate; theme: Theme; currentProjectId?: string; onBack: () => void }) {
    const { message } = App.useApp();
    const { spec, values, setValue, localFiles, setLocalFile, canvasImageNodes, projects, projectId, setProjectId, uploading, lastTaskId, run } = useRunningHubRun(template, { defaultProjectId: currentProjectId });
    const lastTask = useWorkflowTaskStore((state) => (lastTaskId ? state.tasks.find((task) => task.id === lastTaskId) : undefined));

    const canvasImageOptions = useMemo(() => canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id })), [canvasImageNodes]);
    const firstImageIndex = useMemo(() => (spec ? spec.fields.findIndex((field) => field.kind === "image") : -1), [spec]);

    /** 打开面板时，画布上已选中的图片节点自动预填第一个图片字段 */
    useEffect(() => {
        if (firstImageIndex < 0) return;
        const snapshot = useAgentStore.getState().canvasContext?.snapshot;
        if (!snapshot?.selectedNodeIds?.length) return;
        const selected = snapshot.nodes.find((node) => snapshot.selectedNodeIds.includes(node.id) && node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
        if (selected) setValue(firstImageIndex, selected.metadata!.content as string);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template.id, firstImageIndex]);

    if (!spec) return null;

    return (
        <div className="flex min-h-full flex-col gap-3">
            <div className="flex items-center gap-1.5">
                <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} onClick={onBack} />
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: theme.toolbar.panel }}>{template.avatar || "🧩"}</span>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: theme.node.text }}>{template.name}</div>
                <Tag className="m-0 shrink-0 border-0 px-1.5 text-[10px] leading-4" icon={<Cloud className="mr-0.5 inline size-3" />}>云工作流</Tag>
            </div>
            {template.description ? (
                <div className="text-xs leading-5" style={{ color: theme.node.muted }}>{template.description}</div>
            ) : null}

            <div className="flex-1 space-y-4">
                {spec.fields.map((field, index) => {
                    if (field.kind === "image") {
                        const previewSrc = localFiles[index]?.previewUrl || values[`${index}`] || "";
                        return (
                            <div key={index} className="space-y-2">
                                <div className="text-xs font-medium" style={{ color: theme.node.text }}>{field.label}</div>
                                {previewSrc ? (
                                    <img src={previewSrc} alt={field.label} className="h-24 w-24 rounded-lg border object-cover" style={{ borderColor: theme.node.stroke }} />
                                ) : (
                                    <div className="grid h-24 w-24 place-items-center rounded-lg border border-dashed" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                        <ImagePlus className="size-5" />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Select
                                        className="min-w-0 flex-1"
                                        size="small"
                                        allowClear
                                        placeholder={canvasImageOptions.length ? "选画布图片" : "画布上还没有图片"}
                                        options={canvasImageOptions}
                                        optionRender={(option) => (
                                            <div className="flex items-center gap-2">
                                                <img src={String(option.value)} alt="" className="size-6 shrink-0 rounded object-cover" />
                                                <span className="truncate">{option.label}</span>
                                            </div>
                                        )}
                                        value={!localFiles[index] && values[`${index}`] ? values[`${index}`] : undefined}
                                        onChange={(value) => setValue(index, value || "")}
                                    />
                                    <Upload
                                        accept="image/*"
                                        showUploadList={false}
                                        beforeUpload={(file) => {
                                            if (file.size > MAX_UPLOAD_BYTES) message.error("图片超过 30MB，官方接口不支持，请压缩后再试");
                                            else setLocalFile(index, file);
                                            return Upload.LIST_IGNORE;
                                        }}
                                    >
                                        <Button size="small">上传本地图</Button>
                                    </Upload>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={index} className="space-y-2">
                            <div className="text-xs font-medium" style={{ color: theme.node.text }}>{field.label}</div>
                            {field.kind === "number" ? (
                                <InputNumber className="w-full" size="small" placeholder={field.defaultValue || "填写数值"} value={values[`${index}`] ? Number(values[`${index}`]) : null} onChange={(value) => setValue(index, value === null || value === undefined ? "" : String(value))} />
                            ) : (
                                <Input.TextArea rows={2} placeholder={field.defaultValue || "填写内容"} value={values[`${index}`] || ""} onChange={(event) => setValue(index, event.target.value)} />
                            )}
                        </div>
                    );
                })}

                <div className="space-y-2">
                    <div className="text-xs font-medium" style={{ color: theme.node.text }}>结果写入画布</div>
                    <Select
                        className="w-full"
                        size="small"
                        allowClear
                        placeholder={currentProjectId ? "默认当前画布" : projects.length ? "选择画布（默认第一个）" : "将自动新建画布"}
                        value={projectId || undefined}
                        options={projects.map((project) => ({ value: project.id, label: project.title }))}
                        onChange={(value) => setProjectId(value || "")}
                    />
                </div>
            </div>

            <div className="sticky bottom-0 space-y-2 pb-1 pt-2" style={{ background: theme.toolbar.panel }}>
                <Button type="primary" block size="large" icon={<Play className="size-4" />} loading={uploading} onClick={() => void run()}>
                    {uploading ? "上传图片中…" : "立即运行"}
                </Button>
                {lastTask ? (
                    <div className="rounded-md px-2 py-1.5 text-xs leading-5" style={{ background: theme.toolbar.panel, color: lastTask.status === "failed" ? "#f5222d" : theme.node.muted, border: `1px solid ${theme.node.stroke}` }}>
                        最近任务：{STATUS_LABELS[lastTask.status]}
                        {lastTask.status === "failed" && lastTask.error ? `——${lastTask.error}` : ""}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
```

注意：面板不直接订阅 `canvasContext`——画布图片下拉的实时刷新由 hook 内的 `canvasImageNodes`（订阅了 canvasContext）驱动；预填 effect 用 `useAgentStore.getState()` 读一次性快照，避免选中态变化反复触发预填。

- [ ] **Step 2: tab 接入视图切换**

`web/src/components/canvas/canvas-workflow-tab.tsx` 修改点：

1. import 增加 `CanvasWorkflowRunPanel`，删除 `RunningHubRunDialog` 的 import 与 JSX（侧栏不再用弹窗）；
2. 状态 `const [runTarget, setRunTarget] = useState<AgentTemplate | null>(null);` 语义改为「运行视图目标」，模板可能被删除，渲染时从 store 现取：

```tsx
const activeTemplate = useMemo(() => (runTarget ? templates.find((item) => item.id === runTarget.id) || null : null), [runTarget, templates]);
```

3. `startRun` 不变（runninghub → `setRunTarget(template)`）；
4. 渲染主体改为条件切换（运行视图时隐藏列表与任务进度区，返回时恢复）：

```tsx
return (
    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {activeTemplate && activeTemplate.spec.kind === "runninghub" ? (
            <CanvasWorkflowRunPanel template={activeTemplate} theme={theme} currentProjectId={currentProjectId || undefined} onBack={() => setRunTarget(null)} />
        ) : (
            <div className="space-y-3">
                {/* 原列表视图 JSX 原样保留（统计行 / 卡片列表 / 空态 / 任务进度） */}
            </div>
        )}
    </div>
);
```

（注释处为现有 L55-97 的列表 JSX 原样搬入，不做改动；文件尾部的 `<RunningHubRunDialog …/>` 删除。）

- [ ] **Step 3: 类型检查**

Run: `cd web && npm run typecheck`
Expected: 无错误。

- [ ] **Step 4: 浏览器验证（侧栏全流程）**

dev server 打开任意画布页 → 右侧面板「工作流」tab：
1. 点 Z Image 卡片「运行」→ tab 内切换为运行视图：返回栏 + 描述 + 「结果写入画布」+ 底部「立即运行」大按钮，无参数表单（fields 为空）；
2. 点 ← 返回 → 恢复列表视图，任务进度区可见;
3. 未配 Key 点「立即运行」→ 守卫提示，视图不退出；
4. 登记一个含 图片+数值 参数的临时模板 → 侧栏运行视图中：图片字段显示空态虚线框 + 「选画布图片」下拉（画布无图时显示「画布上还没有图片」）+「上传本地图」按钮；选本地文件后缩略图出现；数值字段为步进器；
5. 画布上添加一张图片节点并选中 → 重新进入该模板运行视图 → 第一个图片字段自动预填该节点（缩略图直接显示）；
6. 验证后删除临时模板。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/canvas/canvas-workflow-run-panel.tsx web/src/components/canvas/canvas-workflow-tab.tsx
git commit -m "feat(workflow): 画布侧栏 RunningHub 式运行面板（列表↔运行视图切换）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 收尾——文档、构建与全量回归

**Files:**
- Modify: `CHANGELOG.md`（Unreleased 顶部）
- Modify: `docs/content/docs/progress/pending-test.mdx`（第一条 RunningHub 项）

**Interfaces:**
- Consumes: Task 1-3 全部产出。

- [ ] **Step 1: CHANGELOG 条目**

`CHANGELOG.md` Unreleased 顶部插入：

```markdown
+ [新增] 画布侧栏「工作流」tab 升级为 RunningHub 式运行面板：点云工作流卡片在侧栏内直接进入运行视图（图片缩略图 + 数值步进器 + 底部「立即运行」），图片支持选画布节点（选中节点自动预填）与本地文件上传（≤30MB，提交时经 v2 接口上传），提交后停留视图可迭代重跑，状态条实时跟踪，结果照旧写回画布占位节点；参数类型新增「数值」，登记弹窗与运行弹窗同步支持。
```

- [ ] **Step 2: pending-test.mdx 更新**

第一条（RunningHub OpenAPI v2 迁移那条）末尾追加验证项：

```
；⑥ 画布侧栏运行面板：进入/返回视图、画布节点选择与自动预填、本地图上传缩略图与 30MB 拦截、数值步进器、提交后状态条跟踪至成功写回画布。
```

- [ ] **Step 3: 构建 + 格式**

Run: `cd web && npm run typecheck && npm run build`
Expected: 均通过（chunk 体积警告为既有现象，忽略）。
如改动文件格式有偏差再跑 `npm run format`（只格式化本次触碰的文件后确认 diff 干净）。

- [ ] **Step 4: 浏览器全量回归**

1. `/workflows` 页：登记弹窗（数值类型可选）、Z Image 运行弹窗、守卫提示——不回归；
2. 画布侧栏：Task 3 Step 4 的 1-5 项全部复测一遍；
3. 控制台无新增报错（antd Drawer width 弃用警告为既有现象）。

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/content/docs/progress/pending-test.mdx
git commit -m "docs: 画布侧栏运行面板 CHANGELOG 与待测清单

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 真实验证（用户手动，不在本计划内）

持 API Key 后：登记「高清放大」工作流（图片 + 数值参数，从 RunningHub 工作台导出 API JSON 解析）→ 侧栏上传本地图 → 立即运行 → 状态条跟踪 → 结果写回画布节点。
