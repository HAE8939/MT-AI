# 工作流临时蒙版编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有提示词引擎工作流的蒙版输入改为基于原图临时绘制的可选输入。

**Architecture:** 扩展现有 `CanvasNodeMaskEditDialog`，增加只输出蒙版的工作流模式，并用独立纯函数维护撤销/重做历史。`usePromptEngineRun` 保存编辑器输出的蒙版 data URL，`PromptEngineRunPanel` 负责原图依赖、蒙版卡片和弹窗状态；执行器仅根据 `mask` 是否存在决定是否传给编辑接口。

**Tech Stack:** React 19、TypeScript、Ant Design、lucide-react、Bun Test

---

### Task 1: 蒙版配置与执行器改为可选

**Files:**
- Modify: `web/src/services/prompt-engine/workflow-runner.test.ts`
- Modify: `web/src/services/prompt-engine/workflow-runner.ts`
- Modify: `web/src/types/workflow.ts`
- Modify: `web/public/workflows/场景添加人物-v2.json`
- Modify: `web/public/workflows/指定人物生成.json`
- Modify: `web/public/workflows/指定材质替换.json`
- Modify: `web/public/workflows/局部材质修改.json`
- Modify: `web/public/workflows/局部开灯.json`
- Modify: `web/public/workflows/软硬装局部替换.json`

- [x] **Step 1: 写缺少蒙版仍可运行、存在蒙版仍会透传的失败测试**

```ts
test("allows masked workflows to run without a mask", async () => {
    const workflow = maskedWorkflow();
    expect(validateRunInput(workflow, { image: SOURCE })).toBeNull();
    await runPromptEngineWorkflow(aiConfig, workflow, { image: SOURCE });
    expect(requestEdit.mock.calls.at(-1)?.[3]).toBeUndefined();
});

test("passes a drawn mask to image editing", async () => {
    await runPromptEngineWorkflow(aiConfig, maskedWorkflow(), { image: SOURCE, mask: MASK });
    expect(requestEdit.mock.calls.at(-1)?.[3]?.dataUrl).toBe(MASK);
});
```

- [x] **Step 2: 运行测试并确认第一条因必填校验失败**

Run: `cd web && bun test src/services/prompt-engine/workflow-runner.test.ts`

Expected: FAIL，错误信息包含“请先涂抹蒙版指定修改区域”。

- [x] **Step 3: 删除必填蒙版校验并更新类型与六个内置配置**

```ts
// validateRunInput 只继续校验原图、文字和参考图，不校验 mask。
mask: "optional" | "none";
```

六个 JSON 的 `"mask": "required"` 均改为 `"mask": "optional"`。

- [x] **Step 4: 运行执行器测试并确认通过**

Run: `cd web && bun test src/services/prompt-engine/workflow-runner.test.ts`

Expected: PASS，新增与既有测试均无失败。

### Task 2: 为共享蒙版编辑器增加历史和工作流模式

**Files:**
- Create: `web/src/lib/mask-history.ts`
- Create: `web/src/lib/mask-history.test.ts`
- Modify: `web/src/components/canvas/canvas-node-mask-edit-dialog.tsx`

- [x] **Step 1: 写撤销、重做及新绘制清空重做栈的失败测试**

```ts
test("moves backward and forward through mask snapshots", () => {
    let history = createMaskHistory("blank");
    history = recordMaskSnapshot(history, "stroke-1");
    history = recordMaskSnapshot(history, "stroke-2");
    history = undoMaskSnapshot(history);
    expect(currentMaskSnapshot(history)).toBe("stroke-1");
    history = redoMaskSnapshot(history);
    expect(currentMaskSnapshot(history)).toBe("stroke-2");
});

test("drops redo snapshots after a new stroke", () => {
    let history = recordMaskSnapshot(createMaskHistory("blank"), "stroke-1");
    history = undoMaskSnapshot(history);
    history = recordMaskSnapshot(history, "replacement");
    expect(canRedoMaskSnapshot(history)).toBe(false);
});
```

- [x] **Step 2: 运行测试并确认模块不存在**

Run: `cd web && bun test src/lib/mask-history.test.ts`

Expected: FAIL，无法解析 `@/lib/mask-history`。

- [x] **Step 3: 实现不可变的通用快照历史**

```ts
export type MaskHistory<T> = { entries: T[]; index: number };
export const createMaskHistory = <T>(initial: T): MaskHistory<T> => ({ entries: [initial], index: 0 });
export const recordMaskSnapshot = <T>(state: MaskHistory<T>, value: T): MaskHistory<T> => ({ entries: [...state.entries.slice(0, state.index + 1), value], index: state.index + 1 });
export const undoMaskSnapshot = <T>(state: MaskHistory<T>): MaskHistory<T> => ({ ...state, index: Math.max(0, state.index - 1) });
export const redoMaskSnapshot = <T>(state: MaskHistory<T>): MaskHistory<T> => ({ ...state, index: Math.min(state.entries.length - 1, state.index + 1) });
```

- [x] **Step 4: 运行历史测试并确认通过**

Run: `cd web && bun test src/lib/mask-history.test.ts`

Expected: PASS。

- [x] **Step 5: 扩展蒙版编辑器 props 和输出**

```ts
type MaskEditorMode = "canvas-edit" | "workflow-mask";

export type CanvasImageMaskEditPayload = {
    prompt: string;
    maskDataUrl: string;
    maskPreviewDataUrl: string;
    // existing fields remain
};
```

`workflow-mask` 模式隐藏矩形、羽化、对比图、参考图和提示词；按钮文案改为“确认”。每次完成画笔/擦除、清除或加载初始蒙版后记录 canvas data URL；撤销/重做恢复对应快照。传入 `initialMaskDataUrl` 时将透明修改区还原为选择画布，取消不触发 `onConfirm`。

- [x] **Step 6: 运行历史与执行器测试确认共享逻辑未回归**

Run: `cd web && bun test src/lib/mask-history.test.ts src/services/prompt-engine/workflow-runner.test.ts`

Expected: PASS。

### Task 3: 工作流面板接入临时蒙版编辑

**Files:**
- Create: `web/src/lib/workflow-mask-state.ts`
- Create: `web/src/lib/workflow-mask-state.test.ts`
- Modify: `web/src/components/workflow/use-prompt-engine-run.ts`
- Modify: `web/src/components/workflow/prompt-engine-run-panel.tsx`

- [x] **Step 1: 为原图变化清除蒙版写失败测试并实现状态模块**

```ts
test("clears a saved mask when the source changes", () => {
    const saved = saveWorkflowMask(changeWorkflowMaskSource(emptyWorkflowMaskState, "source-a"), MASK, PREVIEW);
    expect(changeWorkflowMaskSource(saved, "source-b")).toEqual({ sourceKey: "source-b", maskDataUrl: "", maskPreviewDataUrl: "" });
});
```

Run red then green: `cd web && bun test src/lib/workflow-mask-state.test.ts`

- [x] **Step 2: 将 hook 的蒙版上传状态改为编辑器输出状态**

```ts
const [maskDataUrl, setMaskDataUrl] = useState("");
const [maskPreviewDataUrl, setMaskPreviewDataUrl] = useState("");
const clearMask = () => { setMaskDataUrl(""); setMaskPreviewDataUrl(""); };
const saveMask = (mask: string, preview: string) => { setMaskDataUrl(mask); setMaskPreviewDataUrl(preview); };
```

`pickSourceFile`、选择画布原图和清除/切换模板时调用 `clearMask`。`run` 只在 `maskDataUrl` 非空时设置输入的 `mask`。

- [x] **Step 3: 用蒙版卡片替换独立 Upload**

```tsx
<MaskSlot
    disabled={!sourcePreview}
    previewSrc={maskPreviewDataUrl}
    onEdit={() => setMaskEditorOpen(true)}
    onClear={clearMask}
/>
```

没有原图时显示“请先上传原图”；已有原图时显示“点击绘制蒙版”和“可跳过，直接按整图编辑”；已有蒙版时显示预览、“重新绘制”和“清除”。

- [x] **Step 4: 接入工作流模式蒙版编辑器**

```tsx
<CanvasNodeMaskEditDialog
    mode="workflow-mask"
    dataUrl={sourceImage?.dataUrl || sourceFromCanvas}
    initialMaskDataUrl={maskDataUrl || undefined}
    open={maskEditorOpen}
    onClose={() => setMaskEditorOpen(false)}
    onConfirm={(payload) => {
        saveMask(payload.maskDataUrl, payload.maskPreviewDataUrl);
        setMaskEditorOpen(false);
    }}
/>
```

- [x] **Step 5: 运行全部相关单元测试**

Run: `cd web && bun test src/lib/mask-history.test.ts src/services/prompt-engine/workflow-runner.test.ts src/services/api/image.test.ts`

Expected: PASS，0 fail。

### Task 4: 文档和真实界面验证

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`

- [x] **Step 1: 更新用户可见变更记录**

```md
+ [调整] 提示词引擎工作流的蒙版输入改为基于原图临时绘制且始终可选，无蒙版时允许按提示词进行整图编辑。
```

- [x] **Step 2: 更新待测试清单**

记录本地原图、画布原图、有蒙版局部编辑和无蒙版整图编辑四条真实渠道验证路径；确认 todo 没有对应事项需要移动。

- [x] **Step 3: 在运行中的本地站点验证界面**

打开 `http://localhost:3000`，进入任一声明蒙版的工作流，验证无原图禁用、原图后可绘制、确认后预览、重新绘制、清除、切换原图清除蒙版。

- [ ] **Step 4: 用真实 `gpt-image-2` 渠道验证两条请求路径**

分别提交有蒙版与无蒙版请求。Expected: 均进入生成；有蒙版请求只编辑涂抹区域，无蒙版请求不出现“请先涂抹蒙版”或尺寸/格式错误。

- [x] **Step 5: 运行最终相关测试**

Run: `cd web && bun test src/lib/mask-history.test.ts src/services/prompt-engine/workflow-runner.test.ts src/services/api/image.test.ts`

Expected: PASS，0 fail。
