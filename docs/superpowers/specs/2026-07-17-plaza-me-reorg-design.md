# 灵感广场与「我的」页面内容收敛设计

日期：2026-07-17
状态：已与项目负责人逐节确认

## 背景与问题

项目定位是室内行业 AIGC，但当前内容与定位脱节：

1. **灵感广场**加载 `web/public/gallery.json`，内容是 `web/scripts/build-gallery.mjs` 从 NanoBanana Trending Prompts 仓库拉取的 1446 条通用提示词（UI 与平面 / 产品与品牌 / 海报设计 / 摄影 / 美食饮品 / 插画与3D），与室内行业无关。
2. 同一脚本还把精选子集（28 条 `nbp-*`）以「灵感精选」分组注入 `prompts.json`，与广场收藏使用的 `GALLERY_GROUP`（同名「灵感精选」）冲突，导致用户从未收藏过的内置内容混入「我的→收藏」。
3. `prompts.json` 中真正的室内行业提示词（51 条）碎成 9 个小分组，藏在「我的→我的提示词」里，与"我的=私人空间"的定位不符。

## 决策（已确认）

| 决策点 | 结论 |
| --- | --- |
| NanoBanana 1446 条通用内容 | 全部移除，广场只做纯室内行业内容 |
| 广场内容来源 | 内置 51 条室内提示词迁入 + AI 扩充至每类 10–20 条（总量约 100–120 条），中文专业文风对齐现有条目 |
| 内置提示词去向 | 全部迁入广场（含组合模板、专业角色等工具型），「我的」只保留用户自建/导入/收藏，内置提示词机制整体删除 |
| 「我的」素材、生成记录分区 | 本次不动 |
| 实施路线 | 方案 A「彻底收敛」：gallery.json 为唯一公共内容源，删除内置提示词机制与 NanoBanana 管道 |

## 一、数据层

### gallery.json（重建，手工维护）

分类体系（9 类）：

| 分类 | 迁入 | 目标条数 |
| --- | --- | --- |
| SU转写实 | 19 | 20 |
| 室内效果图 | 3（原「室内空间」） | 15 |
| 商业空间 | 4 | 12 |
| 建筑外观 | 3 | 12 |
| 景观规划 | 6 | 12 |
| 软装与材质 | 0（全新创作） | 12 |
| 视角与分镜 | 3 | 10 |
| 组合模板 | 6（组合式键值卡） | 8 |
| 专业角色 | 4 | 6 |

原「创意视觉」3 条按内容归入最接近的分类。原「灵感精选」28 条 `nbp-*` 条目随 NanoBanana 内容一并删除。

条目结构：

```ts
type GalleryItem = {
    id: string;
    title: string;
    prompt: string;
    /** 场景分类，对应 GalleryData.categories */
    category: string;
    /** 空间 / 风格标签，如 现代简约、新中式、日景、鸟瞰 */
    tags: string[];
    /** 组合式键值卡（组合模板分类使用） */
    keys?: PromptKeyGroup[];
    /** 马卡龙卡片配色 */
    color?: PromptColor;
};

type GalleryData = {
    version: number;
    generatedAt: string;
    categories: string[];
    items: GalleryItem[];
};
```

删除字段：`coverUrl`、`author`、`likes`、`views`、`score`、`date`、`sourceUrl`、`attribution`、`tagGroups`（对手工维护的内置数据无意义）。

扩充内容为中文专业提示词，沿用现有效果图术语体系（PBR材质、HDR光照、空气透视、8K 输出等），每条分配 `color`。

### prompts.json

整个文件删除，不再有"内置提示词"概念。

## 二、灵感广场页（`web/src/pages/plaza/index.tsx`）

- 分类 tab 改为按 `item.category` 筛选（当前是拿 tags 凑的）；新增一行空间/风格标签筛选，复用现有 CheckableTag 样式；搜索逻辑不变。
- 详情弹窗删除点赞 / 浏览量 / 作者 / 原帖链接（`formatCount` 一并删除）；页脚 NanoBanana 署名链接删除。
- 交互不变：复制提示词、收藏到「我的」。收藏时 `toPrompt` 需携带 `keys` 与 `color`，组合模板收藏后在「我的」里仍是可勾选键值的组合卡。

## 三、卡片样式（`web/src/components/prompts/prompt-card.tsx`）

`coverUrl` 为空时不再渲染 4:3 灰色占位块，直接展示"马卡龙色条 + 标题 + 正文前三行 + 标签"的文字卡片。广场与「我的」共用此组件，视觉统一。有封面图的用户自建条目展示不变。

## 四、store 精简（`web/src/stores/use-prompt-store.ts`)

删除整套内置提示词机制：

- 状态：`jsonIds`、`deletedJsonIds`、`editedPrompts`、`userPrompts`
- 函数：`mergePrompts`、`loadJsonPrompts`、`restoreJsonPrompt`
- `updatePrompt / removePrompt / renameGroup / removeGroup / importPrompts` 中的所有 json 分支
- `onRehydrateStorage` 不再 fetch prompts.json，rehydrate 直接得到用户数据

store 职责收敛为：用户提示词列表 + 自建分组 + 增删改查 / 导入导出。持久化直接存 `prompts + groups`（项目未上线，不写旧结构迁移）。

收藏机制维持现状：广场收藏 = 写入固定分组 `GALLERY_GROUP`（「灵感精选」）。内置内容清除后该分组只可能来自用户收藏，混杂问题自然消除。

## 五、「我的」页（`web/src/pages/me/prompts-section.tsx`）

- 四个分区不变（收藏 / 我的提示词 / 素材 / 生成记录）；素材、生成记录不动。
- 删除"已隐藏的内置提示词"恢复区及隐藏/恢复相关文案与分支；删除确认统一为"删除后不可撤销"。
- 空状态文案：我的提示词 →「还没有提示词，点击「新建提示词」创建，或去灵感广场收藏」；收藏 → 维持「还没有收藏，去灵感广场逛逛吧」。
- 收藏重复提示简化（去掉"或与已隐藏的内置条目重复"）。

## 六、清理项

- 删除 `web/scripts/build-gallery.mjs`。
- `NOTICE.md` 移除 NanoBanana / CC BY 4.0 署名条目。
- `web/src/services/api/gallery.ts`：删除 `GalleryAttribution` 类型及相关代码，顶部注释更新为实际的室内库描述。

## 错误处理与验证

- 广场加载失败的重试逻辑保留不变。
- 完成后运行 `tsc` 类型检查一次（类型引用改动面大，防止漏改）。

## 范围外

- 「我的」页的素材、生成记录分区。
- 画布、工作流等其它模块。
- 封面图体系（本次条目均为文字卡；后续如需配图另行设计）。
