# Remove Canvas Docs Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除画布左上角菜单中的“文档”入口及其失去用途的链接配置。

**Architecture:** 直接从现有画布页面的静态 Ant Design 菜单配置中删除该项，并清理同文件的图标、常量导入和全局未使用常量。不新增组件、状态或替代交互。

**Tech Stack:** React、TypeScript、Ant Design、lucide-react

---

### Task 1: 删除画布文档入口

**Files:**
- Modify: `web/src/pages/canvas/project.tsx:4`
- Modify: `web/src/pages/canvas/project.tsx:10`
- Modify: `web/src/pages/canvas/project.tsx:2847`
- Modify: `web/src/constant/env.ts:3`

- [x] **Step 1: 删除画布菜单项和相关导入**

从 `project.tsx` 删除 `BookOpen`、`DOCS_URL` 以及以下菜单项：

```tsx
{ key: "docs", icon: <BookOpen className="size-4" />, label: "文档", onClick: () => window.open(DOCS_URL, "_blank", "noopener,noreferrer") },
```

- [x] **Step 2: 删除失去引用的常量**

从 `web/src/constant/env.ts` 删除：

```ts
export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";
```

- [x] **Step 3: 更新用户可感知变更文档**

在 `CHANGELOG.md` 的 `Unreleased` 添加一条 `[调整]` 记录，并在 `docs/content/docs/progress/pending-test.mdx` 添加画布菜单手动验证项。`todo.mdx` 没有对应待办，不修改。

- [x] **Step 4: 静态核对**

运行只读搜索确认 `DOCS_URL`、`docs.canvas.best` 和画布菜单“文档”项均已移除，并用 `git diff --check` 检查补丁格式。按照项目规则不运行测试、构建或开发服务器。
