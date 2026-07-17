# 灵感广场与「我的」页面内容收敛 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 灵感广场重建为纯室内行业灵感库（唯一公共内容源 gallery.json，约 100–120 条），「我的」收敛为纯用户数据，删除内置提示词机制与 NanoBanana 管道。

**Architecture:** 数据先行——先重建 `web/public/gallery.json`（迁移 51 条内置室内提示词 + AI 扩充），再依次改造 gallery 类型与广场页、卡片组件、prompt store 与「我的」页，最后清理脚本与文档。每个任务结束时 `tsc --noEmit` 必须通过。

**Tech Stack:** Vite + React + TypeScript + Ant Design + Tailwind + Zustand（persist → localforage）。无测试基建，验证以 `npm run typecheck` 为准。

**Spec:** `docs/superpowers/specs/2026-07-17-plaza-me-reorg-design.md`

## Global Constraints

- 页面文案保持中文（AGENTS.md）。
- 项目未上线，不写旧数据兼容/迁移兜底（AGENTS.md）。
- 最少行数，不引入新抽象，不顺手重构无关代码（AGENTS.md）。
- 工作区有用户未提交改动（canvas 相关文件等）——`git add` 只加本计划明确列出的路径，严禁 `git add -A` / `git add .`。
- 不跑构建；每任务结束只跑 `cd web && npm run typecheck`。
- 收藏分组常量 `GALLERY_GROUP = "灵感精选"` 保持不变。
- `NOTICE.md` 的 NanoBanana 署名不能整条删除：`web/src/lib/prompt-enhance.ts` 的增强系统提示词仍源自该项目（CC BY 4.0），必须保留这部分署名。

---

### Task 1: 重建 gallery.json（迁移 51 条 + 扩充至约 107 条）

**Files:**
- Modify: `web/public/gallery.json`（整体重写）
- Read only: `web/public/prompts.json`（迁移数据源，本任务不删它）

**Interfaces:**
- Produces: `gallery.json` 顶层 `{ version: 2, generatedAt: string, categories: string[], items: GalleryItem[] }`；条目 `{ id, title, prompt, category, tags, keys?, color? }`。`keys` 结构 `[{ key: string, tags: string[] }]`，`color` 取值 `pink|mint|lavender|lemon|peach|sky|lilac|sage`（对应 `PROMPT_COLORS`）。Task 2 的类型定义、Task 2 广场页筛选都依赖这些字段。

- [ ] **Step 1: 迁移脚本生成底稿**

在仓库根目录运行（一次性脚本，不落盘到仓库）：

```bash
python -X utf8 - <<'EOF'
import json

src = json.load(open('web/public/prompts.json', encoding='utf-8'))['prompts']
CATEGORY_MAP = {
    'SU转写实': 'SU转写实', '室内空间': '室内效果图', '商业空间': '商业空间',
    '建筑外观': '建筑外观', '景观规划': '景观规划', '视角与分镜': '视角与分镜',
    '组合模板': '组合模板', '专业角色': '专业角色', '创意视觉': '__MANUAL__',
}
items = []
for p in src:
    if p.get('group') == '灵感精选' or str(p.get('id', '')).startswith('nbp-'):
        continue  # NanoBanana 内容全部丢弃
    category = CATEGORY_MAP[p['group']]
    tags = [t for t in p.get('tags', []) if t not in ('DMDS', p['group'])]
    item = {'id': p['id'], 'title': p['title'], 'prompt': p.get('prompt', ''),
            'category': category, 'tags': tags}
    if p.get('keys'):
        item['keys'] = p['keys']
    if p.get('color'):
        item['color'] = p['color']
    items.append(item)

data = {
    'version': 2,
    'generatedAt': '2026-07-17T00:00:00.000Z',
    'categories': ['SU转写实', '室内效果图', '商业空间', '建筑外观', '景观规划',
                   '软装与材质', '视角与分镜', '组合模板', '专业角色'],
    'items': items,
}
json.dump(data, open('web/public/gallery.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print('migrated:', len(items))
EOF
```

Expected: `migrated: 51`

- [ ] **Step 2: 归类 3 条「创意视觉」**

打开生成的 `web/public/gallery.json`，找到 `"category": "__MANUAL__"` 的 3 条，逐条阅读 prompt 内容后改为「商业空间 / 室内效果图 / 建筑外观」中最贴切的分类（例如"赛博朋克太空体验舱"是展陈/体验空间 → 商业空间）。完成后全文搜索确认没有 `__MANUAL__` 残留。

- [ ] **Step 3: AI 扩充条目至目标数量**

按下表把每个分类补足到目标条数（新增约 56 条，总量约 107 条）：

| 分类 | 迁入基数 | 目标 | 新增 |
| --- | --- | --- | --- |
| SU转写实 | 19 | 20 | 1 |
| 室内效果图 | 3+归类 | 15 | ~11 |
| 商业空间 | 4+归类 | 12 | ~7 |
| 建筑外观 | 3+归类 | 12 | ~8 |
| 景观规划 | 6 | 12 | 6 |
| 软装与材质 | 0 | 12 | 12 |
| 视角与分镜 | 3 | 10 | 7 |
| 组合模板 | 6 | 8 | 2 |
| 专业角色 | 4 | 6 | 2 |

新增条目硬性要求：

1. `id` 用 `gal-<分类拼音缩写>-NNN`（如 `gal-rzsn-001` 软装、`gal-snxg-001` 室内效果图），全库唯一。
2. 全中文专业文风，对齐迁入条目的术语体系：PBR材质、HDR光照、空气透视、全局光照、超写实、8K输出、体积光、浅景深等；正文 60–200 字。
3. `tags` 放 1–3 个空间/风格标签（如 现代简约、新中式、奶油风、侘寂风、日景、夜景、鸟瞰、特写、客厅、卧室、大堂），不重复分类名。
4. 每条分配 `color`，同分类内轮换取值避免同屏同色。
5. 「组合模板」新增条目必须带 `keys`（键值组合卡），例如键：空间类型/设计风格/主材/光影氛围/渲染精度。
6. 「专业角色」条目是角色设定型提示词（"你是一位……"开头）。

完整示例（软装与材质，普通条目）：

```json
{
    "id": "gal-rzsn-001",
    "title": "奶油风客厅布艺软装特写",
    "prompt": "奶油风客厅软装特写镜头，米白色云朵布艺沙发搭配燕麦色针织盖毯，原木边几上放置陶土花瓶与蒲苇干花，背景为奶咖色艺术涂料墙面，局部微水泥质感，PBR材质细节真实，柔和漫射自然光从纱帘透入，浅景深突出织物纹理，色调温暖统一，超写实室内摄影风格，8K输出。",
    "category": "软装与材质",
    "tags": ["奶油风", "客厅", "特写"],
    "color": "peach"
}
```

完整示例（组合模板，键值组合条目）：

```json
{
    "id": "gal-zhmb-007",
    "title": "软装搭配组合构建器",
    "prompt": "基于以下键值组合生成软装搭配效果图提示词：",
    "category": "组合模板",
    "tags": ["软装", "组合式"],
    "keys": [
        { "key": "空间类型", "tags": ["客厅", "卧室", "书房", "餐厅"] },
        { "key": "设计风格", "tags": ["奶油风", "新中式", "侘寂风", "现代简约"] },
        { "key": "主材质感", "tags": ["布艺针织", "原木肌理", "微水泥", "岩板金属"] },
        { "key": "光影氛围", "tags": ["清晨柔光", "午后斜阳", "夜晚暖光"] },
        { "key": "渲染精度", "tags": ["8K超写实", "PBR材质+全局光照"] }
    ],
    "color": "mint"
}
```

- [ ] **Step 4: 校验数据**

```bash
python -X utf8 - <<'EOF'
import json, collections
d = json.load(open('web/public/gallery.json', encoding='utf-8'))
items = d['items']
ids = [i['id'] for i in items]
assert len(ids) == len(set(ids)), '存在重复 id'
cats = set(d['categories'])
counts = collections.Counter(i['category'] for i in items)
targets = {'SU转写实': 20, '室内效果图': 15, '商业空间': 12, '建筑外观': 12,
           '景观规划': 12, '软装与材质': 12, '视角与分镜': 10, '组合模板': 8, '专业角色': 6}
assert cats == set(targets), '分类列表与目标不一致'
COLORS = {'pink','mint','lavender','lemon','peach','sky','lilac','sage'}
for i in items:
    assert i['category'] in cats, i['id']
    assert i['title'].strip() and i['prompt'].strip(), i['id']
    assert 'coverUrl' not in i and 'author' not in i and 'likes' not in i, i['id']
    if 'color' in i: assert i['color'] in COLORS, i['id']
    for g in i.get('keys', []):
        assert g['key'].strip() and g['tags'], i['id']
for k, v in targets.items():
    assert counts[k] == v, (k, counts[k], v)
print('OK, total:', len(items), dict(counts))
EOF
```

Expected: `OK, total: 107 {...每类等于目标值...}`

- [ ] **Step 5: Commit**

```bash
git add web/public/gallery.json
git commit -m "feat(plaza): rebuild gallery.json as indoor-industry prompt library"
```

---

### Task 2: gallery 类型精简 + 广场页改造

**Files:**
- Modify: `web/src/services/api/gallery.ts`（整体重写）
- Modify: `web/src/pages/plaza/index.tsx`（整体重写）

**Interfaces:**
- Consumes: Task 1 的 gallery.json 结构；`PromptKeyGroup` / `PromptColor` / `GALLERY_GROUP`（`@/stores/use-prompt-store`，本任务不改 store）；`getPromptText` / `isComboPrompt`（`@/components/prompts/prompt-combo`）；`PromptComboBuilder`（`@/components/prompts/prompt-combo-builder`）。
- Produces: `GalleryItem = { id; title; prompt; category; tags; keys?; color? }`、`GalleryData = { version; generatedAt; categories; items }`、`loadGallery(): Promise<GalleryData>`（缓存行为不变）。

- [ ] **Step 1: 重写 `web/src/services/api/gallery.ts`**

```ts
import type { PromptColor, PromptKeyGroup } from "@/stores/use-prompt-store";

/**
 * 灵感广场数据：public/gallery.json 为项目内置、手工维护的室内行业灵感库，
 * 按场景分类（SU转写实/室内效果图/商业空间/建筑外观/景观规划/软装与材质/视角与分镜/组合模板/专业角色），
 * 条目带空间/风格标签，组合模板类条目带键值组合 keys。
 * 只在广场首次打开时按需加载，模块级缓存避免重复请求。
 */

export type GalleryItem = {
    id: string;
    title: string;
    prompt: string;
    /** 场景分类，对应 GalleryData.categories */
    category: string;
    /** 空间 / 风格标签 */
    tags: string[];
    /** 组合式键值卡（组合模板分类使用） */
    keys?: PromptKeyGroup[];
    /** 马卡龙卡片配色 */
    color?: PromptColor;
};

export type GalleryData = {
    version: number;
    generatedAt: string;
    categories: string[];
    items: GalleryItem[];
};

let galleryCache: Promise<GalleryData> | null = null;

export function loadGallery(): Promise<GalleryData> {
    if (!galleryCache) {
        galleryCache = fetchGallery().catch((error) => {
            galleryCache = null;
            throw error;
        });
    }
    return galleryCache;
}

async function fetchGallery(): Promise<GalleryData> {
    const base = import.meta.env.BASE_URL || "/";
    const response = await fetch(`${base}gallery.json`);
    if (!response.ok) throw new Error(`加载灵感广场失败：HTTP ${response.status}`);
    const data = (await response.json()) as GalleryData;
    if (!Array.isArray(data?.items)) throw new Error("灵感广场数据格式不正确");
    return data;
}
```

- [ ] **Step 2: 重写 `web/src/pages/plaza/index.tsx`**

要点：分类 tab 按 `item.category` 筛选；新增一行空间/风格标签多选筛选；卡片复制走 `getPromptText`（组合模板复制默认勾选的组合 JSON）；详情弹窗组合条目渲染 `PromptComboBuilder`；删除封面图、作者/点赞/浏览/原帖、页脚署名、`formatCount`。

```tsx
import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";
import { BookmarkPlus, Search } from "lucide-react";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptComboBuilder } from "@/components/prompts/prompt-combo-builder";
import { getPromptText, isComboPrompt } from "@/components/prompts/prompt-combo";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { loadGallery, type GalleryData, type GalleryItem } from "@/services/api/gallery";
import { GALLERY_GROUP, usePromptStore } from "@/stores/use-prompt-store";
import type { Prompt } from "@/services/api/prompts";

const GALLERY_PAGE_SIZE = 24;
const ALL_OPTION = "全部";

/** 广场条目转提示词卡片；卡片展示用空日期（不显示日期），收藏时再补真实时间 */
function toPrompt(item: GalleryItem): Prompt {
    return {
        id: item.id,
        title: item.title,
        coverUrl: "",
        prompt: item.prompt,
        tags: item.tags,
        keys: item.keys,
        color: item.color,
        createdAt: "",
        updatedAt: "",
        group: GALLERY_GROUP,
    };
}

/** 灵感广场：只读公共内容源，条目只有「复制提示词」和「收藏」两个动作，收藏落入「我的→收藏」 */
export default function PlazaPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [data, setData] = useState<GalleryData | null>(null);
    const [loadError, setLoadError] = useState("");
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState(ALL_OPTION);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState<GalleryItem | null>(null);

    const prompts = usePromptStore((s) => s.prompts);
    const importPrompts = usePromptStore((s) => s.importPrompts);
    const libraryIds = useMemo(() => new Set(prompts.map((p) => p.id)), [prompts]);

    useEffect(() => {
        if (data) return;
        setLoadError("");
        loadGallery()
            .then(setData)
            .catch((error) => setLoadError(error instanceof Error ? error.message : "加载灵感广场失败"));
    }, [data]);

    const categoryItems = useMemo(() => {
        if (!data) return [];
        return category === ALL_OPTION ? data.items : data.items.filter((item) => item.category === category);
    }, [data, category]);

    const tagOptions = useMemo(() => Array.from(new Set(categoryItems.flatMap((item) => item.tags))), [categoryItems]);

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return categoryItems.filter((item) => {
            if (selectedTags.length && !selectedTags.some((tag) => item.tags.includes(tag))) return false;
            if (!kw) return true;
            return [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(kw);
        });
    }, [categoryItems, selectedTags, keyword]);

    const pageItems = useMemo(() => filtered.slice((page - 1) * GALLERY_PAGE_SIZE, page * GALLERY_PAGE_SIZE), [filtered, page]);

    const changeFilter = (next: () => void) => {
        next();
        setPage(1);
    };

    const toggleTag = (tag: string) =>
        changeFilter(() => setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag])));

    const copyItem = (item: GalleryItem) =>
        copyText(getPromptText(toPrompt(item)), item.keys?.length ? "组合提示词已复制，请到画布中粘贴使用" : "提示词已复制，请到画布中粘贴使用");

    const saveToFavorites = (item: GalleryItem) => {
        const now = new Date().toISOString();
        const { added } = importPrompts([{ ...toPrompt(item), createdAt: now, updatedAt: now }]);
        if (added > 0) message.success(`「${item.title}」已收藏，可在「我的」中查看`);
        else message.info("该条目已收藏过");
    };

    const categoryTabs = [ALL_OPTION, ...(data?.categories || [])];
    const detailPrompt = detail ? toPrompt(detail) : null;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
                <div className="mx-auto max-w-5xl text-center">
                    <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">灵感广场</h1>
                    <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">浏览室内行业提示词灵感，复制到画布使用，或收藏到「我的」。</p>
                </div>

                <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center gap-3">
                    <Input className="max-w-xs" prefix={<Search className="size-4 text-stone-400" />} value={keyword} placeholder="搜索标题、正文或标签" allowClear onChange={(event) => changeFilter(() => setKeyword(event.target.value))} />
                    <div className="flex flex-wrap gap-2">
                        {categoryTabs.map((tab) => (
                            <Tag.CheckableTag
                                key={tab}
                                checked={category === tab}
                                className={cn("prompt-filter-tag", category === tab && "is-active")}
                                onChange={() =>
                                    changeFilter(() => {
                                        setCategory(tab);
                                        setSelectedTags([]);
                                    })
                                }
                            >
                                {tab}
                            </Tag.CheckableTag>
                        ))}
                    </div>
                    {data ? <span className="ml-auto text-xs text-stone-400">共 {filtered.length} 条</span> : null}
                </div>

                {tagOptions.length > 0 ? (
                    <div className="mx-auto mt-4 flex max-w-6xl flex-wrap items-start gap-2">
                        <span className="pt-1 text-xs font-medium text-stone-500 dark:text-stone-400">标签</span>
                        <div className="flex flex-wrap gap-2">
                            {tagOptions.map((tag) => (
                                <Tag.CheckableTag key={tag} checked={selectedTags.includes(tag)} className={cn("prompt-filter-tag", selectedTags.includes(tag) && "is-active")} onChange={() => toggleTag(tag)}>
                                    {tag}
                                </Tag.CheckableTag>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="mx-auto mt-6 max-w-7xl">
                    {loadError ? (
                        <div className="flex h-60 flex-col items-center justify-center gap-3">
                            <span className="text-sm text-red-500">{loadError}</span>
                            <Button
                                onClick={() => {
                                    setData(null);
                                    setLoadError("");
                                }}
                            >
                                重试
                            </Button>
                        </div>
                    ) : !data ? (
                        <div className="flex h-60 items-center justify-center">
                            <Spin tip="正在加载灵感广场数据…" />
                        </div>
                    ) : pageItems.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的灵感" className="py-16" />
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {pageItems.map((item) => {
                                const saved = libraryIds.has(item.id);
                                return (
                                    <PromptCard
                                        key={item.id}
                                        item={toPrompt(item)}
                                        onOpen={() => setDetail(item)}
                                        onCopy={() => copyItem(item)}
                                        extraAction={
                                            <Button size="small" type="primary" ghost disabled={saved} icon={<BookmarkPlus className="size-3.5" />} onClick={() => saveToFavorites(item)}>
                                                {saved ? "已收藏" : "收藏"}
                                            </Button>
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {filtered.length > GALLERY_PAGE_SIZE ? (
                    <div className="mx-auto mt-6 flex max-w-7xl justify-end border-t border-stone-200 pt-4 dark:border-stone-700">
                        <Pagination current={page} total={filtered.length} pageSize={GALLERY_PAGE_SIZE} showSizeChanger={false} onChange={setPage} />
                    </div>
                ) : null}
            </main>

            <Modal
                title={detail?.title}
                open={Boolean(detail)}
                onCancel={() => setDetail(null)}
                width={720}
                centered
                footer={
                    detail ? (
                        <div className="flex justify-end gap-2">
                            <Button onClick={() => copyItem(detail)}>复制</Button>
                            <Button type="primary" disabled={libraryIds.has(detail.id)} icon={<BookmarkPlus className="size-3.5" />} onClick={() => saveToFavorites(detail)}>
                                {libraryIds.has(detail.id) ? "已收藏" : "收藏"}
                            </Button>
                        </div>
                    ) : null
                }
            >
                {detail && detailPrompt ? (
                    <div className="thin-scrollbar max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                        {detail.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {detail.tags.map((tag) => (
                                    <Tag key={tag} className="m-0 text-[11px]">
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        ) : null}
                        {isComboPrompt(detailPrompt) ? (
                            <div>
                                {detail.prompt.trim() ? <p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-300">{detail.prompt}</p> : null}
                                <PromptComboBuilder prompt={detailPrompt} onCopy={(text) => copyText(text, "组合提示词已复制，请到画布中粘贴使用")} useLabel="复制组合" />
                            </div>
                        ) : (
                            <pre className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-xs leading-5 text-stone-700 dark:bg-stone-900 dark:text-stone-300">{detail.prompt}</pre>
                        )}
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
```

注意：`PromptComboBuilder` 的实际 props 以 `web/src/components/prompts/prompt-combo-builder.tsx` 为准（`pages/me/components/prompt-detail-dialog.tsx` 中的用法 `<PromptComboBuilder prompt={prompt} onCopy={(text) => onCopy(text)} useLabel="复制组合" />` 是现成参照）；若 `getPromptText` 签名与 `getPromptText(item: Prompt)` 不符，同样以 `prompt-combo.ts` 现有导出为准调整调用处。

- [ ] **Step 3: 类型检查**

```bash
cd web && npm run typecheck
```

Expected: 通过，无错误。（此时 store/me 页尚未改动，二者不引用被删的 gallery 字段。）

- [ ] **Step 4: Commit**

```bash
git add web/src/services/api/gallery.ts web/src/pages/plaza/index.tsx
git commit -m "feat(plaza): category-driven indoor gallery with tag filter and combo support"
```

---

### Task 3: 无封面文字卡片（PromptCard + 详情弹窗）

**Files:**
- Modify: `web/src/components/prompts/prompt-card.tsx:41-53`
- Modify: `web/src/pages/me/components/prompt-detail-dialog.tsx:28-37`

**Interfaces:**
- Consumes: `Prompt.coverUrl`（空串表示无封面）。
- Produces: 无封面时卡片/弹窗不渲染 4:3 占位块；有封面的用户自建条目展示不变。组件对外 props 不变。

- [ ] **Step 1: PromptCard 去掉无封面占位块**

`prompt-card.tsx` 中 `cover={...}` 的三元表达式，`item.coverUrl` 为空时改为 `undefined`（antd Card 不渲染 cover 区）：

```tsx
cover={
    item.coverUrl ? (
        <button type="button" className="block w-full text-left" onClick={onOpen}>
            <img src={item.coverUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" />
        </button>
    ) : undefined
}
```

删除原 else 分支的 ✦ 占位 `<button>` 块。

- [ ] **Step 2: 详情弹窗无封面时隐藏图片列**

`prompt-detail-dialog.tsx` 外层布局改为条件双列（记得在文件顶部补 `import { cn } from "@/lib/utils";`）：

```tsx
<div className={cn("grid gap-5", prompt.coverUrl && "md:grid-cols-[300px_minmax(0,1fr)]")}>
    {prompt.coverUrl ? (
        <div className="space-y-3">
            <img src={prompt.coverUrl} alt={prompt.title} className="aspect-[4/3] w-full rounded-lg object-cover" />
        </div>
    ) : null}
    <div className="min-w-0">
```

删除原 else 分支的 ✦ 占位块。

- [ ] **Step 3: 类型检查**

```bash
cd web && npm run typecheck
```

Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/prompts/prompt-card.tsx web/src/pages/me/components/prompt-detail-dialog.tsx
git commit -m "feat(prompts): text-first card when no cover image"
```

---

### Task 4: store 精简 + 「我的」页去内置化 + 删除 prompts.json

**Files:**
- Modify: `web/src/stores/use-prompt-store.ts`（整体重写）
- Modify: `web/src/pages/me/prompts-section.tsx`
- Modify: `web/src/pages/me/components/prompt-detail-dialog.tsx`（去掉 `isJsonPrompt`）
- Delete: `web/public/prompts.json`

**Interfaces:**
- Consumes: 无（本任务是删减）。
- Produces: `usePromptStore` 状态收敛为 `{ hydrated, prompts, groups }` + 动作 `addPrompt / updatePrompt / removePrompt / duplicatePrompt / addGroup / renameGroup / removeGroup / importPrompts`（签名均不变）；`jsonIds / deletedJsonIds / editedPrompts / userPrompts / restoreJsonPrompt` 从类型中消失，所有引用方必须同步清理。`GALLERY_GROUP`、`PROMPT_COLORS`、`normalizePromptKeys`、`Prompt` 类型导出不变（`prompt-io.ts`、`services/api/prompts.ts` 无需改动）。

- [ ] **Step 1: 重写 `web/src/stores/use-prompt-store.ts`**

保留文件头部的 `PROMPT_COLORS / PromptColor / PromptKeyGroup / Prompt` 类型定义与 `normalizePromptKeys`（原样），替换其余部分：

```ts
type PromptStore = {
    hydrated: boolean;
    prompts: Prompt[];
    /** 用户自建分组（提示词自带的 group 字段会在 UI 层合并进来） */
    groups: string[];
    addPrompt: (prompt: Omit<Prompt, "id" | "createdAt" | "updatedAt">) => string;
    updatePrompt: (id: string, patch: Partial<Omit<Prompt, "id" | "createdAt">>) => void;
    removePrompt: (id: string) => void;
    duplicatePrompt: (id: string) => string | null;
    addGroup: (name: string) => void;
    renameGroup: (oldName: string, newName: string) => void;
    removeGroup: (name: string) => void;
    importPrompts: (items: Partial<Prompt>[], groups?: string[]) => { added: number; skipped: number };
};

const PROMPT_STORE_KEY = "infinite-canvas:prompt_store";

/** 灵感广场收藏条目的固定分组 */
export const GALLERY_GROUP = "灵感精选";

function createPromptId() {
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePromptStore = create<PromptStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            prompts: [],
            groups: [],

            addPrompt: (prompt) => {
                const now = new Date().toISOString();
                const id = createPromptId();
                const newPrompt: Prompt = { ...prompt, id, createdAt: now, updatedAt: now };
                set((state) => ({ prompts: [newPrompt, ...state.prompts] }));
                return id;
            },

            updatePrompt: (id, patch) => {
                set((state) => ({
                    prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
                }));
            },

            removePrompt: (id) => {
                set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) }));
            },

            duplicatePrompt: (id) => {
                const source = get().prompts.find((p) => p.id === id);
                if (!source) return null;
                const now = new Date().toISOString();
                const newId = createPromptId();
                const copy: Prompt = {
                    ...source,
                    id: newId,
                    title: `${source.title}（副本）`,
                    keys: source.keys?.map((k) => ({ key: k.key, tags: [...k.tags] })),
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({ prompts: [copy, ...state.prompts] }));
                return newId;
            },

            addGroup: (name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                set((state) => (state.groups.includes(trimmed) ? state : { groups: [...state.groups, trimmed] }));
            },

            renameGroup: (oldName, newName) => {
                const trimmed = newName.trim();
                if (!trimmed || trimmed === oldName) return;
                set((state) => {
                    const now = new Date().toISOString();
                    const prompts = state.prompts.map((p) => (p.group === oldName ? { ...p, group: trimmed, updatedAt: now } : p));
                    const groups = Array.from(new Set(state.groups.map((g) => (g === oldName ? trimmed : g))));
                    return { prompts, groups };
                });
            },

            removeGroup: (name) => {
                set((state) => {
                    const now = new Date().toISOString();
                    const prompts = state.prompts.map((p) => {
                        if (p.group !== name) return p;
                        const { group: _group, ...rest } = p;
                        return { ...rest, updatedAt: now } as Prompt;
                    });
                    return { prompts, groups: state.groups.filter((g) => g !== name) };
                });
            },

            importPrompts: (items, groups) => {
                const state = get();
                const existingIds = new Set(state.prompts.map((p) => p.id));
                const now = new Date().toISOString();
                const toAdd: Prompt[] = [];
                let skipped = 0;
                for (const item of items) {
                    const title = typeof item?.title === "string" ? item.title.trim() : "";
                    const promptText = typeof item?.prompt === "string" ? item.prompt : "";
                    const keys = normalizePromptKeys(item?.keys);
                    // 无标题、或既无正文也无组合键值的条目视为无效
                    if (!title || (!promptText.trim() && !keys)) {
                        skipped += 1;
                        continue;
                    }
                    // 重复 id 跳过，避免覆盖已有提示词
                    if (typeof item.id === "string" && existingIds.has(item.id)) {
                        skipped += 1;
                        continue;
                    }
                    const id = typeof item.id === "string" && item.id ? item.id : createPromptId();
                    toAdd.push({
                        id,
                        title,
                        coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : "",
                        prompt: promptText,
                        tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === "string") : [],
                        keys,
                        group: typeof item.group === "string" && item.group.trim() ? item.group.trim() : undefined,
                        color: PROMPT_COLORS.includes(item.color as PromptColor) ? (item.color as PromptColor) : undefined,
                        createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
                        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
                    });
                    existingIds.add(id);
                }
                if (toAdd.length > 0 || groups?.length) {
                    set((s) => ({
                        prompts: [...toAdd, ...s.prompts],
                        groups: Array.from(
                            new Set([
                                ...s.groups,
                                ...(groups || []).filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim()),
                                ...toAdd.map((p) => p.group).filter((g): g is string => Boolean(g)),
                            ]),
                        ),
                    }));
                }
                return { added: toAdd.length, skipped };
            },
        }),
        {
            name: PROMPT_STORE_KEY,
            storage: {
                getItem: async (name) => {
                    const value = await localForageStorage.getItem(name);
                    return value ? JSON.parse(value) : null;
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            } satisfies PersistStorage<PromptStore>,
            partialize: (state) => ({ prompts: state.prompts, groups: state.groups }) as StorageValue<PromptStore>["state"],
            onRehydrateStorage: () => () => {
                usePromptStore.setState({ hydrated: true });
            },
        },
    ),
);
```

删除：`mergePrompts`、`loadJsonPrompts`、`restoreJsonPrompt` 及状态字段 `jsonIds / deletedJsonIds / editedPrompts / userPrompts`。

- [ ] **Step 2: 精简 `web/src/pages/me/prompts-section.tsx`**

逐项修改：

1. 删除 store 选择器：`jsonIds`、`deletedJsonIds`、`restoreJsonPrompt` 三行。
2. 删除 `handleRestore` 函数和底部"已隐藏的项目内置提示词"整个区块（`deletedJsonIds.length > 0` 分支）；删除 import 中的 `RotateCcw`。
3. `handleDelete` 去掉 json 分支，统一为删除：

```tsx
const handleDelete = (item: Prompt) => {
    Modal.confirm({
        title: "删除提示词",
        content: `确定要删除「${item.title}」吗？此操作不可撤销。`,
        okText: "删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: () => {
            removePrompt(item.id);
            message.success("已删除");
            if (selectedPrompt?.id === item.id) setSelectedPrompt(null);
        },
    });
};
```

4. 空状态判断 `totalPrompts === 0 && deletedJsonIds.length === 0` 改为 `totalPrompts === 0`；空状态文案改为：`"还没有提示词，点击「新建提示词」创建，或去灵感广场收藏"`（favorites 分支文案不变）。
5. `PromptDetailDialog` 调用处删除 `isJsonPrompt={...}` prop。

- [ ] **Step 3: `prompt-detail-dialog.tsx` 删除 `isJsonPrompt`**

删除 props 中的 `isJsonPrompt?: boolean` 与解构默认值；删除「项目内置」Tag、`" · 来自 prompts.json"` 文案；删除按钮文案三元 `{isJsonPrompt ? "隐藏" : "删除"}` 改为固定 `删除`。

- [ ] **Step 4: 删除内置数据文件**

```bash
git rm web/public/prompts.json
```

- [ ] **Step 5: 类型检查**

```bash
cd web && npm run typecheck
```

Expected: 通过。若报错，检查是否还有文件引用 `jsonIds / deletedJsonIds / restoreJsonPrompt / isJsonPrompt`（已知引用方仅本任务三个文件）。

- [ ] **Step 6: Commit**

```bash
git add web/src/stores/use-prompt-store.ts web/src/pages/me/prompts-section.tsx web/src/pages/me/components/prompt-detail-dialog.tsx
git commit -m "refactor(me): drop built-in prompt machinery, me page is user-data only"
```

（`git rm` 已暂存 prompts.json 的删除，随本次提交一并生效。）

---

### Task 5: 清理 NanoBanana 管道与文档

**Files:**
- Delete: `web/scripts/build-gallery.mjs`
- Modify: `NOTICE.md`（第三方数据与内容一节）
- Modify: `README.md:44`
- Modify: `docs/content/docs/overview/features.mdx:162`

**Interfaces:**
- Consumes: 无。
- Produces: 无代码接口；仓库中不再有 NanoBanana 数据管道，文档描述与实际一致。`web/src/lib/prompt-enhance.ts` 的 NanoBanana 署名保留。

- [ ] **Step 1: 删除构建脚本**

```bash
git rm web/scripts/build-gallery.mjs
```

- [ ] **Step 2: 改写 NOTICE.md 第三方条目**

「## 第三方数据与内容」一节替换为（只保留 prompt-enhance 署名，删除 gallery 数据与封面图两条）：

```markdown
## 第三方数据与内容

- **提示词增强系统提示词**（`web/src/lib/prompt-enhance.ts`）改编自 [NanoBanana Trending Prompts](https://github.com/jau123/nanobanana-trending-prompts) 项目，© [MeiGen.ai](https://meigen.ai)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。
- 灵感广场数据（`web/public/gallery.json`）为本项目自建的室内行业提示词库，不含第三方再分发内容。
```

- [ ] **Step 3: 更新 README.md 第 44 行**

原句中「含灵感精选约 30 条」「灵感画廊按需加载 1,446 条 NanoBanana 热门提示词（CC BY 4.0 © MeiGen.ai）」等描述改为：

```markdown
- 提示词库：「灵感广场」内置约 107 条室内行业提示词（SU转写实、室内效果图、商业空间、建筑外观、景观规划、软装与材质、视角与分镜、组合模板、专业角色），支持搜索、分类与标签筛选、一键收藏到「我的」；「我的」空间支持新建、编辑、分组和 JSON 导入导出，用户数据持久化在浏览器本地；提示词编辑器内置「AI 增强」，调用已配置文本模型把简单描述改写为专业结构化提示词。
```

- [ ] **Step 4: 更新 docs/content/docs/overview/features.mdx 第 162 行**

原句提到 `web/public/prompts.json`、DMDS 内置库与 NanoBanana 灵感精选，改为：

```markdown
公共提示词库位于「灵感广场」（`web/public/gallery.json`，约 107 条室内行业提示词）；「我的」页只保存用户自建、导入与收藏的提示词，变更持久化在浏览器本地。
```

（`docs/content/docs/progress/reduction-refactor-plan.mdx` 是历史计划文档，不改。）

- [ ] **Step 5: 类型检查（最终门禁）**

```bash
cd web && npm run typecheck
```

Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add NOTICE.md README.md docs/content/docs/overview/features.mdx
git commit -m "chore: remove NanoBanana gallery pipeline, align docs with indoor library"
```

（`git rm` 已暂存 build-gallery.mjs 的删除，随本次提交一并生效。）

---

## 完成标准

1. 广场只展示室内行业内容，9 个分类、约 107 条，分类/标签/搜索/复制/收藏可用，组合模板可在详情中勾选组合。
2. 「我的→我的提示词」初始为空（仅用户数据）；「我的→收藏」只含用户从广场收藏的条目；无"隐藏/恢复内置"痕迹。
3. 仓库无 `prompts.json`、无 `build-gallery.mjs`；NOTICE/README/features 文档与实际一致。
4. `cd web && npm run typecheck` 通过。
