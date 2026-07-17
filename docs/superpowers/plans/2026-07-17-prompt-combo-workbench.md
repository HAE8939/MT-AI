# Prompt Combo Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 DMDS 提示词选择器的完整能力(卡片层级组合、label/value 标签、通用 JSON 导入、LLM 结果结构化微调回填)整合进 MT-AI,让组合式提示词从「详情弹窗里复制」升级为「画布侧栏工作台直填节点」。

**Architecture:** 组合式提示词数据模型从扁平 `keys` 升级为 DMDS 对齐的两级 `cards`(卡片→键→标签,标签带 label/value/selected);组合与解析逻辑全部收敛为 `prompt-combo.ts` 纯函数;画布侧栏新增「提示词」tab 作为组合工作台,通过既有 `canvasContext.applyOps` 的 `update_node` op 写回节点;文档智能体的 JSON 结果通过 hover 工具栏「结构化编辑」进入侧栏草稿模式,形成 LLM 生成→点选微调→回填生成节点的闭环。

**Tech Stack:** Vite、React 19、TypeScript、Ant Design 6、Tailwind CSS 4、Zustand 5、localforage、bun test(仅编写,不执行)。

## Global Constraints

- 按 AGENTS.md:实施过程不执行语法检查、typecheck、build 或测试命令,由用户自行验证。
- 按 AGENTS.md:项目尚未上线,不需要兼容旧数据;`Prompt.keys` 直接替换为 `cards`,不写旧字段兼容或迁移兜底。
- 页面文案保持中文;画布 UI 遵循 `canvasThemes`/`useThemeStore`,不硬编码黑白/stone 颜色。
- 写代码保持最少行数,不引入新依赖,不改无关文件,不顺手重构。
- 全局状态放 `web/src/stores/`,画布组件放 `web/src/components/canvas/`,纯逻辑放组件同目录工具文件。
- 每个任务完成后检查 `CHANGELOG.md` Unreleased 与 `docs/content/docs/progress/pending-test.mdx`(统一在 Task 8 收口)。

## Confirmed Decisions

- 范围:全部四步(直填、通用 JSON 导入、智能体闭环、数据模型升级)+ DMDS 默认卡片组内容移植(内容已买断,无授权问题)。
- 画布入口形态:画布侧栏(Agent 面板)新增「提示词」tab,不做节点面板弹层。
- 角色预设无需移植:`web/public/roles.json` 与 DMDS `default-roles.json` 的 7 个角色 systemPrompt 已逐字一致(已核对)。
- 不移植 DMDS 的 iframe/postMessage 架构、分组页签工作区(Group→Tab)、undo 历史和拖拽排序;MT-AI 以「提示词库条目 = 一个工作台」承载,分组复用提示词库现有 group。
- 组合 JSON 语义与 DMDS 对齐:`{卡片名: {键名: 选中标签值以", "连接}}`;卡片名为空串时该卡片的键值平铺到顶层(兼容单层组合卡片的现有输出形态)。
- 通用 JSON 导入语义与 DMDS `handleImportUniversalJson` 对齐:顶层标量值→单键「内容」卡片;字符串值按 `/`、`+`、`、`、`，`、`,` 拆分为多标签;数组→逐元素标签;嵌套对象→JSON.stringify 单标签;键内按 value 去重;导入标签全部 `selected: true`(保证导入后立即组合可还原原 JSON)。
- 侧栏写回节点复用 `canvas-agent-ops.ts` 现有 `update_node` op(`applyOps([{ type: "update_node", id, metadata: { prompt } }])`),不新增管线。
- 结构化编辑草稿是会话态,存 `use-agent-store`(不持久化)。
- 纯函数测试文件随代码提交,但不在实施过程中运行,由用户执行 `bun test`。

## Public Types and Interfaces

### `web/src/stores/use-prompt-store.ts`(修改)

```ts
/** 组合式标签:label 为芯片显示文本,value 为组合进 JSON 的实际值(缺省用 label),selected 为初始勾选 */
export type PromptComboTag = {
    label: string;
    value?: string;
    selected?: boolean;
};

/** 键值标签组(tags 从 string[] 升级为对象标签) */
export type PromptKeyGroup = {
    key: string;
    tags: PromptComboTag[];
};

/** 组合卡片:name 为组合 JSON 的一级键;空串表示该卡片键值平铺到顶层 */
export type PromptComboCard = {
    name: string;
    keys: PromptKeyGroup[];
};

export type Prompt = {
    // ...其余字段不变
    /** 可选:组合卡片,存在且非空时该条目为「组合式卡片」(替换原 keys 字段) */
    cards?: PromptComboCard[];
};

/** 清洗 cards 字段,容忍导入/JSON 中的脏数据(string 标签自动包为 { label });无有效内容返回 undefined */
export function normalizePromptCards(value: unknown): PromptComboCard[] | undefined;
```

### `web/src/components/prompts/prompt-combo.ts`(重写)

```ts
import type { Prompt, PromptComboCard } from "@/stores/use-prompt-store";

/** cards 非空即视为组合卡片 */
export function isComboPrompt(prompt: Prompt): boolean;

/** 深拷贝卡片(structuredClone),供组合器做本地勾选状态 */
export function cloneComboCards(cards: PromptComboCard[]): PromptComboCard[];

/** 按 selected 标签组合键值 JSON:{卡片名: {键: "值, 值"}};无名卡片平铺顶层;空卡片/空键跳过 */
export function buildComboJson(cards: PromptComboCard[]): Record<string, unknown>;

/** 组合最终文本:basePrompt(如有)+ "\n\n" + JSON.stringify(buildComboJson, null, 2) */
export function buildComboText(basePrompt: string, cards: PromptComboCard[]): string;

/** 卡片级默认文本(按数据自带 selected 组合),用于卡片复制/收藏预览 */
export function getPromptText(prompt: Prompt): string;

/** 组合卡片键值组总数,用于卡片角标文案 */
export function countComboKeys(cards: PromptComboCard[]): number;

/** DMDS 通用 JSON 导入:任意对象 → 组合卡片;非对象/数组/空对象返回 null */
export function comboCardsFromJson(data: unknown): PromptComboCard[] | null;

/** 从自由文本提取组合卡片:优先 ``` 代码块,其次首个 { 到末个 } 子串;解析失败返回 null */
export function extractComboCardsFromText(text: string): PromptComboCard[] | null;

/** 编辑器草稿:每行一个标签,语法 `标签名` 或 `标签名=实际值`,行首 `*` 表示默认勾选 */
export type ComboKeyDraft = { key: string; tagsText: string };
export type ComboCardDraft = { name: string; keys: ComboKeyDraft[] };
export function cardsToDrafts(cards?: PromptComboCard[]): ComboCardDraft[];
export function draftsToCards(drafts: ComboCardDraft[]): PromptComboCard[] | undefined;
```

### `web/src/components/prompts/prompt-combo-builder.tsx`(重写)

```tsx
/** 卡片层级组合器:内部 state 为 cloneComboCards 的副本,点选切换 selected,实时 JSON 预览 */
export function PromptComboBuilder({
    basePrompt = "",
    cards,
    onCopy,
    onUse,
    useLabel = "使用此提示词",
}: {
    basePrompt?: string;
    cards: PromptComboCard[];
    onCopy?: (text: string) => void;
    onUse?: (text: string) => void;
    useLabel?: string;
});
```

### `web/src/stores/use-agent-store.ts`(修改)

```ts
export type AgentPanelTab = "chat" | "workflow" | "prompts" | "setup" | "history" | "log";

/** 结构化编辑草稿(会话态,不持久化,不进 partialize) */
export type PromptComboDraft = { title: string; cards: PromptComboCard[]; sourceNodeId: string };
// state 增加:
promptComboDraft: PromptComboDraft | null;   // 初始 null
// setter 复用现有 setAgentState({ promptComboDraft: ... })
```

### `web/src/services/api/gallery.ts`(修改)

```ts
export type GalleryItem = {
    // ...其余字段不变
    cards?: PromptComboCard[];   // 替换原 keys 字段
};
```

---

## Phase 1: 数据模型与纯逻辑

### Task 1: 升级组合数据模型与组合函数

**Files:**
- Modify: `web/src/stores/use-prompt-store.ts`
- Rewrite: `web/src/components/prompts/prompt-combo.ts`
- Create: `web/src/components/prompts/prompt-combo.test.ts`

**Interfaces:**
- Produces: 上文 Public Types 中 `use-prompt-store.ts` 与 `prompt-combo.ts` 的全部导出(除 comboCardsFromJson/extractComboCardsFromText,在 Task 2 实现)。

- [ ] `use-prompt-store.ts`:新增 `PromptComboTag`/`PromptComboCard` 类型,`PromptKeyGroup.tags` 改为 `PromptComboTag[]`,`Prompt.keys` 字段整体替换为 `cards?: PromptComboCard[]`(全仓不再有 `Prompt.keys`)。
- [ ] `normalizePromptKeys` 改名为 `normalizePromptCards`,按新结构清洗:数组元素须有 `keys` 数组;卡片 `name` 转字符串并 trim(空串合法);键须非空、tags 须非空;tag 元素为 string 时包为 `{ label }`,为对象时保留 `label`(非空)/`value`(可选)/`selected`(布尔);无有效卡片返回 `undefined`。
- [ ] `importPrompts` 中 `normalizePromptKeys(item?.keys)` 改为 `normalizePromptCards(item?.cards)`;有效性判断同步改为「无标题、或既无正文也无 cards 视为无效」;`duplicatePrompt` 的 keys 深拷贝改为 `cards: source.cards ? structuredClone(source.cards) : undefined`。
- [ ] 重写 `prompt-combo.ts`,实现 `isComboPrompt`/`cloneComboCards`/`buildComboJson`/`buildComboText`/`getPromptText`/`countComboKeys`,语义按 Confirmed Decisions:

```ts
export function buildComboJson(cards: PromptComboCard[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const card of cards) {
        const cardData: Record<string, string> = {};
        for (const group of card.keys) {
            const chosen = group.tags.filter((tag) => tag.selected);
            if (chosen.length > 0) cardData[group.key] = chosen.map((tag) => tag.value || tag.label).join(", ");
        }
        if (Object.keys(cardData).length === 0) continue;
        const name = card.name.trim();
        if (name) result[name] = cardData;
        else Object.assign(result, cardData);
    }
    return result;
}
```

- [ ] `getPromptText(prompt)`:非组合卡片返回 `prompt.prompt`;组合卡片按数据自带 `selected` 走 `buildComboText(prompt.prompt, prompt.cards!)`(不再有「默认选第一个」规则,默认勾选完全由数据 `selected` 决定)。
- [ ] 实现 `cardsToDrafts`/`draftsToCards`:序列化标签行为 `` `${selected ? "*" : ""}${label}${value && value !== label ? "=" + value : ""}` ``;解析时去除行首 `*` 得 selected,按**第一个** `=` 拆 label/value,空行忽略;`draftsToCards` 结果经 `normalizePromptCards` 清洗。
- [ ] 新建 `prompt-combo.test.ts`(`import { describe, expect, test } from "bun:test"`,参照 `web/src/services/api/cos-media.test.ts` 风格),覆盖:

```ts
describe("buildComboJson", () => {
    test("有名卡片嵌套、无名卡片平铺、未勾选键被跳过", () => {
        const cards = [
            { name: "场景", keys: [{ key: "时间", tags: [{ label: "清晨", selected: true }, { label: "黄昏" }] }] },
            { name: "", keys: [{ key: "分辨率", tags: [{ label: "8K", value: "超高分辨率 (8K)", selected: true }] }, { key: "空键", tags: [{ label: "未选" }] }] },
        ];
        expect(buildComboJson(cards)).toEqual({ 场景: { 时间: "清晨" }, 分辨率: "超高分辨率 (8K)" });
    });
    test("多选标签以逗号空格连接且 value 缺省回退 label", () => {
        const cards = [{ name: "", keys: [{ key: "光影", tags: [{ label: "体积光", selected: true }, { label: "冷暖对比", value: "顶级冷暖对冲", selected: true }] }] }];
        expect(buildComboJson(cards)).toEqual({ 光影: "体积光, 顶级冷暖对冲" });
    });
});
describe("drafts 往返", () => {
    test("cardsToDrafts 与 draftsToCards 互逆", () => {
        const cards = [{ name: "渲染", keys: [{ key: "分辨率", tags: [{ label: "8K", value: "超高分辨率 (8K)", selected: true }, { label: "4K", value: "超高分辨率 (4K)" }] }] }];
        expect(draftsToCards(cardsToDrafts(cards))).toEqual(cards);
    });
    test("行首 * 与 = 语法解析", () => {
        const drafts = [{ name: "", keys: [{ key: "时间", tagsText: "*清晨\n黄金时刻\n蓝调=蓝调时刻" }] }];
        expect(draftsToCards(drafts)).toEqual([{ name: "", keys: [{ key: "时间", tags: [{ label: "清晨", selected: true }, { label: "黄金时刻" }, { label: "蓝调", value: "蓝调时刻" }] }] }]);
    });
});
```

(以 `draftsToCards` 实际输出的可选字段形态为准微调断言,例如 selected 为 false 时省略字段。)

**Acceptance:** 全仓无 `Prompt.keys` 引用残留(`prompt-card.tsx` 等调用点的编译错误在 Task 3 一并消除,本任务允许暂时编译不过但需在任务说明中列出待改调用点);`prompt-combo.ts` 不依赖 React。

### Task 2: 通用 JSON 导入解析器

**Files:**
- Modify: `web/src/components/prompts/prompt-combo.ts`
- Modify: `web/src/components/prompts/prompt-combo.test.ts`

**Interfaces:**
- Produces: `comboCardsFromJson(data: unknown): PromptComboCard[] | null`、`extractComboCardsFromText(text: string): PromptComboCard[] | null`。

- [ ] 实现 `comboCardsFromJson`(DMDS `handleImportUniversalJson` 语义的纯函数移植):

```ts
const TAG_SEPARATOR = /\/|\+|、|，|,/;

export function comboCardsFromJson(data: unknown): PromptComboCard[] | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const cards: PromptComboCard[] = [];
    for (const [cardName, cardValue] of Object.entries(data)) {
        if (!cardValue || typeof cardValue !== "object" || Array.isArray(cardValue)) {
            cards.push({ name: cardName, keys: [{ key: "内容", tags: [{ label: String(cardValue), selected: true }] }] });
            continue;
        }
        const keys: PromptKeyGroup[] = [];
        for (const [keyName, keyValue] of Object.entries(cardValue)) {
            const tags: PromptComboTag[] = [];
            const push = (label: string) => {
                const value = label.trim();
                if (!value || tags.some((tag) => (tag.value || tag.label).trim() === value)) return;
                tags.push({ label: value, selected: true });
            };
            if (typeof keyValue === "string") keyValue.split(TAG_SEPARATOR).forEach(push);
            else if (Array.isArray(keyValue)) keyValue.forEach((item) => push(typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)));
            else if (typeof keyValue === "object" && keyValue !== null) push(JSON.stringify(keyValue));
            else push(String(keyValue));
            if (tags.length > 0) keys.push({ key: keyName, tags });
        }
        if (keys.length > 0) cards.push({ name: cardName, keys });
    }
    return cards.length > 0 ? cards : null;
}
```

- [ ] 实现 `extractComboCardsFromText`:① 优先匹配首个 ``` 围栏代码块(容忍 ```json 语言标记)取块内文本;② 否则取首个 `{` 到末个 `}` 的子串;③ `JSON.parse` 失败返回 `null`,成功则交给 `comboCardsFromJson`。
- [ ] 测试补充:嵌套两级 JSON 正常转卡片;顶层标量值转「内容」卡片;字符串按 `/`、`、`、`，`、`,`、`+` 拆分多标签;数组值逐元素;键内重复值去重;带 ```json 围栏及前后中文说明文字的文本可提取;纯散文返回 `null`。

**Acceptance:** `comboCardsFromJson(buildComboJson(cards))` 对「全部勾选、无分隔符标签」的卡片可无损还原键名与值(测试中体现);两个函数均为纯函数,无 DOM/React 依赖。

---

## Phase 2: 组件改造

### Task 3: 重写组合构建器并更新全部调用点

**Files:**
- Rewrite: `web/src/components/prompts/prompt-combo-builder.tsx`
- Modify: `web/src/components/prompts/prompt-card.tsx`
- Modify: `web/src/pages/me/components/prompt-detail-dialog.tsx`
- Modify: `web/src/pages/plaza/index.tsx`
- Modify: `web/src/components/prompts/prompt-io.ts`
- Modify: `web/src/services/api/gallery.ts`

**Interfaces:**
- Consumes: Task 1 的 `cloneComboCards`/`buildComboText`/`isComboPrompt`/`countComboKeys`/`getPromptText`。
- Produces: 新版 `PromptComboBuilder`(签名见 Public Types)。

- [ ] 重写 `PromptComboBuilder`:内部 `useState(() => cloneComboCards(cards))`,`useEffect` 在 `cards` 引用变化时重置;按卡片分区渲染(卡片名作小节标题,无名卡片不显示标题),键名下渲染 `Tag.CheckableTag` 芯片(沿用现有 `prompt-filter-tag` 类名与主题),芯片显示 `label`,当 `value` 存在且不同于 `label` 时加 `title={value}` 原生提示;点选切换对应 tag 的 `selected`(不可变更新);底部保留 JSON 预览 `<pre>` 与 复制/onUse 按钮,组合文本 `useMemo(() => buildComboText(basePrompt, cardsState))`。
- [ ] `prompt-card.tsx`:`isComboPrompt` 判断不变;组合卡片摘要文案改为 `` `组合式 · ${item.cards.length} 张卡片 · ${countComboKeys(item.cards)} 个键值组` ``;卡片级复制继续走 `getPromptText(item)`。
- [ ] `prompt-detail-dialog.tsx`(我的页详情):`<PromptComboBuilder basePrompt={prompt.prompt} cards={prompt.cards!} onCopy={...} />`(原 `prompt={prompt}` 改为新 props;移除无效的 `useLabel="复制组合"`)。
- [ ] `plaza/index.tsx`:详情弹窗 `:218` 同步改为新 props;`toPrompt`(`:18`)中 `keys` 字段映射改为 `cards: normalizePromptCards(item.cards)`。
- [ ] `gallery.ts`:`GalleryItem.keys` 改为 `cards?: PromptComboCard[]`(import 类型同步调整)。
- [ ] `prompt-io.ts`:导出文件 `version` 提升为 `2`;`buildExportFile` 挑选字段列表中 `keys` 替换为 `cards`(若为整对象展开则无需改字段,仅改版本号);`parseImportJson` 不需旧格式兼容。
- [ ] `prompt-editor-dialog.tsx` 本任务只做**最小编译修复**(`keysToDrafts`/`draftsToKeys` 引用改为 Task 4 前的临时直通:`cards` 读写,编辑功能完整重构在 Task 4)。若改动无法收敛为几行,允许在本任务直接开始 Task 4 的结构(两任务由同一执行者连续完成时合并提交)。

**Acceptance:** `web` 目录下 `grep -r "PromptKeyGroup" src` 仅剩新语义引用,无 `\.keys`(Prompt 组合语义)残留;广场与我的页的组合详情弹窗按卡片分区渲染、点选实时更新 JSON 预览;普通(非组合)条目行为不变。

### Task 4: 编辑器支持卡片草稿与「从 JSON 导入」

**Files:**
- Modify: `web/src/pages/me/components/prompt-editor-dialog.tsx`

**Interfaces:**
- Consumes: Task 1 的 `cardsToDrafts`/`draftsToCards`/`ComboCardDraft`/`ComboKeyDraft`;Task 2 的 `extractComboCardsFromText`。

- [ ] 草稿 state 从 `KeyDraft[]` 改为 `ComboCardDraft[]`(`cardsToDrafts(prompt?.cards)` 初始化);UI 结构:卡片列表 → 每张卡片一个分区(卡片名 Input + 删除卡片按钮 + 「添加键值组」按钮)→ 键值组行沿用现有「键名 Input + 候选值 TextArea + 删除按钮」布局。
- [ ] 候选值 TextArea 的 placeholder 更新为:`每行一个标签:标签名 或 标签名=实际值,行首 * 表示默认勾选`。
- [ ] 新增「添加卡片」按钮(追加 `{ name: "", keys: [{ key: "", tagsText: "" }] }`)。
- [ ] 新增「从 JSON 导入」按钮:弹出 Ant Design Modal + TextArea,粘贴任意 JSON 提示词 → `extractComboCardsFromText` → 成功则 `cardsToDrafts` 追加到现有草稿并提示导入的卡片数,失败 `message.error("未能从文本中解析出 JSON 提示词")`。
- [ ] 保存路径:`draftsToCards(cardDrafts)` 写入 `payload.cards`;校验规则保持「组合式卡片正文可空(只要有 cards)」。
- [ ] 「AI 增强」逻辑不动(仍只作用于正文 `promptText`)。

**Acceptance:** 新建/编辑组合卡片可增删卡片与键值组、标记默认勾选与 label=value;粘贴文档智能体输出的 JSON(含围栏代码块)可一键生成卡片草稿;保存后详情弹窗按新结构渲染。

---

## Phase 3: 画布侧栏「提示词」tab

### Task 5: 侧栏提示词工作台(浏览 + 组合 + 直填节点)

**Files:**
- Create: `web/src/components/canvas/canvas-prompt-tab.tsx`
- Modify: `web/src/stores/use-agent-store.ts`
- Modify: `web/src/components/canvas/canvas-local-agent-panel.tsx`

**Interfaces:**
- Consumes: `usePromptStore`(prompts/groups)、`useAgentStore.canvasContext`(snapshot.selectedNodeIds/nodes、applyOps)、Task 3 的 `PromptComboBuilder`、Task 1 的 `getPromptText`/`isComboPrompt`。
- Produces: `export function CanvasPromptTab({ theme }: { theme: CanvasTheme })`(theme 类型与 `CanvasWorkflowTab` 的 props 保持一致);`AgentPanelTab` 联合类型新增 `"prompts"`。

- [ ] `use-agent-store.ts:12`:`AgentPanelTab` 增加 `"prompts"`;state 增加 `promptComboDraft: PromptComboDraft | null`(初始 `null`,类型见 Public Types,更新走现有 `setAgentState`,**不加入持久化 partialize**——该 store 如无 persist 则无需处理)。
- [ ] `canvas-local-agent-panel.tsx`:tabs items 数组(`:496-505`)在「工作流」后插入 `{ value: "prompts", label: "提示词" }`;渲染分支(`:533-609`)增加 `activeTab === "prompts" && <CanvasPromptTab theme={theme} />`。
- [ ] 新建 `canvas-prompt-tab.tsx`,参照 `canvas-workflow-tab.tsx` 的结构与主题用法:
  - 顶部:搜索 Input(过滤 title/tags)+ 分组 `Tag.CheckableTag` 行(全部 + store 分组,数据源与 `prompts-section.tsx:40-45` 同规则,含「灵感精选」)。
  - 列表:紧凑行(标题 + 组合角标/正文一行摘要),点击展开;组合条目展开为 `<PromptComboBuilder basePrompt={prompt.prompt} cards={prompt.cards!} onUse={fill} onCopy={copy} useLabel="填入选中节点" />`,普通条目展开为正文 `<pre>` + 「填入选中节点」「复制」按钮(填入文本为 `prompt.prompt`)。
  - 填入逻辑:

```ts
const context = useAgentStore((state) => state.canvasContext);
const snapshot = context?.snapshot;
const targetNode = (() => {
    if (!snapshot || snapshot.selectedNodeIds.length !== 1) return null;
    const node = snapshot.nodes.find((item) => item.id === snapshot.selectedNodeIds[0]);
    return node && node.type !== CanvasNodeType.Group && node.type !== CanvasNodeType.Config ? node : null;
})();
const fill = (text: string) => {
    if (!context || !targetNode) return;
    context.applyOps([{ type: "update_node", id: targetNode.id, metadata: { prompt: text } }]);
    message.success(`已填入节点「${targetNode.title}」`);
};
```

  - 「填入选中节点」在 `targetNode` 为空时禁用,并在 tab 顶部显示轻量提示文案:未打开画布项目 → 「请先打开画布项目」;选中数 ≠ 1 或类型不符 → 「请在画布中选中一个生成节点」。
  - 复制走项目现有复制 hook(与 `plaza/index.tsx` 的 `copyText` 同源;若该 hook 在 `web/src/hooks/` 有全局版本则直接用,否则用 `navigator.clipboard.writeText` + `message.success`)。
- [ ] 主题:全部颜色取自传入 `theme`(参照 `canvas-workflow-tab.tsx` 现有写法),不写 `dark ?` 分支。

**Acceptance:** 画布页打开侧栏可见「提示词」tab;选中一个图片节点后,展开组合条目点选标签,点「填入选中节点」,该节点提示词面板出现组合 JSON 文本;未选节点/多选时按钮禁用且提示正确;非画布路由下提示「请先打开画布项目」。

---

## Phase 4: 智能体结果结构化编辑闭环

### Task 6: 文本节点「结构化编辑」→ 侧栏草稿模式

**Files:**
- Modify: `web/src/components/canvas/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-prompt-tab.tsx`

**Interfaces:**
- Consumes: Task 2 的 `extractComboCardsFromText`;Task 5 的 `promptComboDraft` state 与 `CanvasPromptTab`;`useAgentStore` 现有 `openPanel()`/`setAgentState`;`usePromptStore.addPrompt`。

- [ ] `canvas-node-hover-toolbar.tsx`:新增 props `onStructuredEdit?: (node: CanvasNodeData) => void`;文本节点(`isText`)且 `useMemo(() => extractComboCardsFromText(node.metadata?.content || "") !== null, [node.metadata?.content])` 为真时,显示「结构化编辑」按钮(lucide `SlidersHorizontal` 图标,风格对齐现有按钮),点击回调 `onStructuredEdit(node)`。
- [ ] `project.tsx`:在 hover 工具栏挂载点(`:3137-3164`)传入处理函数:

```ts
const handleStructuredEdit = useCallback((node: CanvasNodeData) => {
    const cards = extractComboCardsFromText(node.metadata?.content || "");
    if (!cards) return;
    const store = useAgentStore.getState();
    store.setAgentState({ promptComboDraft: { title: `${node.title || "分析结果"} · 结构化`, cards, sourceNodeId: node.id }, activeTab: "prompts" });
    store.openPanel();
}, []);
```

- [ ] `canvas-prompt-tab.tsx` 增加草稿视图:`promptComboDraft` 非空时,列表顶部渲染草稿区(标题 + 关闭按钮清空草稿),内容为 `<PromptComboBuilder basePrompt="" cards={draft.cards} onUse={fill} onCopy={copy} useLabel="填入选中节点" />`,并追加「保存到提示词库」按钮:

```ts
const saveDraft = () => {
    usePromptStore.getState().addPrompt({ title: draft.title, coverUrl: "", prompt: "", tags: [], cards: draft.cards });
    message.success("已保存到提示词库");
};
```

- [ ] 草稿为会话态:切换项目/刷新后消失属预期,不做持久化。

**Acceptance:** 运行「通用效果图返推大师」得到 JSON 分析文本节点后,hover 出现「结构化编辑」;点击后侧栏切到「提示词」tab 并显示卡片化草稿;取消勾选若干标签、选中一个图片节点、点「填入选中节点」,JSON 中对应键消失且节点提示词更新;「保存到提示词库」后在「我的」页可见并可再编辑;纯散文文本节点不出现该按钮。

---

## Phase 5: 内容移植

### Task 7: gallery.json 组合条目升级 + DMDS 默认工作台移植

**Files:**
- Modify: `web/public/gallery.json`

**Interfaces:**
- Consumes: Task 1 的 cards 数据格式(gallery.json 为静态数据,无代码依赖,但格式须与 `normalizePromptCards` 兼容)。

- [ ] 既有 8 条「组合模板」条目(`keys` 字段者,如 `dmds-combo-1`)按机械规则转换:`keys: [{key, tags: string[]}]` → `cards: [{ "name": "", "keys": [{ "key": key, "tags": tags.map((t, i) => ({ "label": t, ...(i === 0 ? { "selected": true } : {}) })) }] }]`(每条包成单张无名卡片,首标签默认勾选,保持与旧「默认选第一个」输出一致);删除原 `keys` 字段。
- [ ] 新增 1 条 DMDS 默认工作台条目(追加到 items「组合模板」分类区段末尾),内容如下(源自 DMDS `prompt-selector.html` DEFAULT_CARDS,已去除内部 id,label/value/selected 语义保留):

```json
{
  "id": "dmds-combo-workbench",
  "title": "室内效果图组合工作台",
  "prompt": "",
  "category": "组合模板",
  "tags": ["室内", "效果图", "SU转写实", "组合工作台"],
  "color": "sky",
  "cards": [
    { "name": "空间类型", "keys": [
      { "key": "空间类型", "tags": [ { "label": "室内设计", "selected": true }, { "label": "建筑设计" }, { "label": "景观设计" }, { "label": "规划设计" } ] },
      { "key": "图纸要求", "tags": [ { "label": "su截图转写实摄影", "selected": true }, { "label": "3D截图转写实摄影" } ] }
    ] },
    { "name": "核心约束", "keys": [
      { "key": "几何保真度", "tags": [ { "label": "严格保持原始 su 场景结构、物体位置和几何形状，严禁改变空间布局。" } ] },
      { "key": "物体完整性", "tags": [ { "label": "保持所有家具、灯具和装饰品的原始样式与比例。" } ] },
      { "key": "转换逻辑", "tags": [ { "label": "PBR 真实材质", "value": "将基础 su 模型面转换为高精度、符合物理规律的真实材质（PBR）。" } ] },
      { "key": "图像比例", "tags": [ { "label": "保持和原图相同的比例。" }, { "label": "横版16:9", "value": "16:9" }, { "label": "横版4:3", "value": "4:3" }, { "label": "竖版3:4", "value": "3:4" }, { "label": "竖版9:16", "value": "9:16" }, { "label": "1:1" } ] }
    ] },
    { "name": "场景与光效", "keys": [
      { "key": "空间说明", "tags": [ { "label": "截图为同一空间的不同角度" } ] },
      { "key": "时间", "tags": [ { "label": "清晨", "selected": true }, { "label": "黄金时刻" }, { "label": "蓝调时刻" } ] },
      { "key": "人物", "tags": [ { "label": "无人物" }, { "label": "动态模糊", "selected": true } ] },
      { "key": "外景", "tags": [ { "label": "人行道" }, { "label": "薄雾" }, { "label": "城市高层天空" }, { "label": "厦门江景" } ] },
      { "key": "环境光", "tags": [ { "label": "柔和冷调窗光", "value": "由窗户透过柔和偏冷自然光线" }, { "label": "柔和自然天光", "value": "远处外景进入的柔和自然天光" }, { "label": "柔和淡蓝色自然天光", "value": "远处外景进入的柔和淡蓝色自然天光" }, { "label": "光线细腻有层次" }, { "label": "照射在建筑主体上" }, { "label": "窗户处允许曝光" } ] },
      { "key": "室内光", "tags": [ { "label": "暖光开启", "value": "所有室内人工暖光源开启" }, { "label": "微弱照度", "value": "灯光照度微弱" }, { "label": "中性灯光", "value": "极其精致中性灯光" } ] },
      { "key": "氛围效果", "tags": [ { "label": "体积光" }, { "label": "薄雾效果" } ] },
      { "key": "光影品质", "tags": [ { "label": "电影级别布光" }, { "label": "冷暖对比", "value": "形成顶级的冷暖光影对冲" }, { "label": "高动态对比", "value": "高动态光影对比" }, { "label": "柔和漫反射", "value": "柔和漫反射，真实阴影层次" } ] }
    ] },
    { "name": "材质控制", "keys": [
      { "key": "墙面", "tags": [ { "label": "乳胶漆" }, { "label": "米色乳胶漆" } ] },
      { "key": "顶面", "tags": [ { "label": "米色乳胶漆" } ] },
      { "key": "地面", "tags": [ { "label": "木地板" }, { "label": "轻微烟雾效果" } ] },
      { "key": "沙发", "tags": [ { "label": "米白毛绒质感" }, { "label": "皮革材质" } ] },
      { "key": "地毯", "tags": [ { "label": "短毛质感" } ] },
      { "key": "窗帘", "tags": [ { "label": "百叶窗" } ] }
    ] },
    { "name": "摄影参数", "keys": [
      { "key": "相机型号", "tags": [ { "label": "尼康 Z9 (Nikon Z9)", "selected": true } ] },
      { "key": "光圈", "tags": [ { "label": "f/1.2" }, { "label": "f/5.6" }, { "label": "f/8" } ] },
      { "key": "快门", "tags": [ { "label": "1s", "selected": true } ] },
      { "key": "风格", "tags": [ { "label": "35mm胶片质感" } ] },
      { "key": "拍摄技术", "tags": [ { "label": "HDR包围曝光", "value": "高动态范围 (HDR) 拍摄，包围曝光，确保暗部不失真、亮部不过曝。" } ] }
    ] },
    { "name": "渲染精度", "keys": [
      { "key": "分辨率", "tags": [ { "label": "8K", "value": "超高分辨率 (8K)", "selected": true }, { "label": "4K", "value": "超高分辨率 (4K)" }, { "label": "2K", "value": "超高分辨率 (2K)" } ] },
      { "key": "画面表现", "tags": [ { "label": "青橙色调" }, { "label": "电影级后期调色" } ] },
      { "key": "细节表现", "tags": [ { "label": "细节丰富" }, { "label": "质感通透" }, { "label": "写实室内摄影" }, { "label": "景深效果" }, { "label": "暗角" } ] }
    ] }
  ]
}
```

- [ ] 确认修改后的 gallery.json 是合法 JSON(执行者可用 `node -e "JSON.parse(require('fs').readFileSync('web/public/gallery.json','utf8'))"` 校验,这属于数据校验而非构建,允许执行)。

**Acceptance:** 灵感广场「组合模板」分类下原 8 条条目详情正常按卡片渲染(单无名卡片、首标签默认勾选),新条目「室内效果图组合工作台」展示 6 张有名卡片,组合预览输出与 DMDS「通用效果图返推大师」的 JSON 提示词结构一致;收藏到「我的」后可编辑。

---

## Phase 6: 文档收口

### Task 8: 更新变更记录与待测清单

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/todo.mdx`(检查,如无相关待办则确认无需修改)

- [ ] `CHANGELOG.md` Unreleased 追加(措辞可按现有条目风格微调):
  - `[新增] 画布侧栏新增「提示词」tab,支持浏览提示词库、点选组合标签并直接填入选中节点`
  - `[新增] 文档智能体的 JSON 分析结果支持「结构化编辑」,一键转为可点选组合卡片微调后回填生成节点或保存到提示词库`
  - `[调整] 组合式提示词升级为卡片层级结构(卡片→键→标签,标签支持简称/实际值与默认勾选),提示词编辑器同步支持卡片编辑与任意 JSON 提示词一键导入`
  - `[新增] 灵感广场「组合模板」新增「室内效果图组合工作台」(源自 DMDS 默认卡片组)`
- [ ] `pending-test.mdx` 逐条列出本次可测变更(侧栏 tab 直填、结构化编辑闭环、编辑器卡片草稿与 JSON 导入、gallery 新条目与 8 条旧条目格式升级、组合导出文件版本升为 2),并注明:用户需自行运行 `bun run typecheck` 与 `bun test src/components/prompts/prompt-combo.test.ts` 验证。
- [ ] 检查 `todo.mdx`:如列有「提示词选择器 / DMDS 组合」相关待办则移入 pending-test,无则确认不改。
- [ ] 不更新 `features.mdx`(按文档规范,待用户测试确认后再写入正式功能说明)。

**Acceptance:** CHANGELOG 与 pending-test 内容与实际改动一一对应,无过期日期,无夸大表述(不写"云同步"等未有能力)。

---

## Manual Acceptance Matrix

| 场景 | 步骤 | 预期 |
| --- | --- | --- |
| 广场组合详情 | 灵感广场 → 组合模板 → 打开「室内效果图组合工作台」 | 6 张有名卡片分区渲染,默认勾选项与本计划 JSON 的 selected 一致,预览输出嵌套 JSON |
| 侧栏直填 | 画布选中 1 个图片节点 → 侧栏「提示词」tab → 展开组合条目点选 → 填入选中节点 | 节点提示词面板出现组合文本;多选/未选时按钮禁用并提示 |
| 智能体闭环 | 选图运行「通用效果图返推大师」→ hover 结果节点 → 结构化编辑 → 微调 → 填入选中节点 | 侧栏出现卡片草稿;取消勾选的键不出现在回填 JSON 中 |
| 草稿入库 | 上一场景中点「保存到提示词库」 | 「我的」页出现该组合条目,可编辑卡片/键/标签 |
| 编辑器 JSON 导入 | 我的 → 新建提示词 → 从 JSON 导入 → 粘贴带 ```json 围栏的智能体输出 | 卡片草稿自动生成,保存后详情可点选 |
| 导入导出 | 我的 → 导出全部 → 清空浏览器数据 → 导入 | 组合条目(cards 格式,version 2)完整还原 |
| 纯函数 | 用户运行 `bun test src/components/prompts/prompt-combo.test.ts` | 全部通过 |
| 类型检查 | 用户运行 `bun run typecheck` | 无错误 |

## Execution Order

1. Task 1 → Task 2(同文件连续,建议同一执行者)
2. Task 3 → Task 4(Task 3 结束前仓库可能暂不编译,Task 4 完成后应可通过 typecheck)
3. Task 5 → Task 6
4. Task 7(仅数据,可与 Task 5/6 并行)
5. Task 8(最后收口)
