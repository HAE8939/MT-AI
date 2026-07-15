// 构建灵感画廊数据：
//   1. web/public/gallery.json       全量 1,446 条（灵感画廊页按需懒加载）
//   2. web/public/prompts.json       合并精选子集（每分类按 score 取前 20，随内置库启动加载）
//
// 数据源: https://github.com/jau123/nanobanana-trending-prompts
// 许可证: CC BY 4.0 (© MeiGen.ai)，再分发需保留署名，见 NOTICE.md
//
// 用法:
//   node scripts/build-gallery.mjs            # 从 GitHub 拉取最新数据
//   node scripts/build-gallery.mjs <源文件>   # 使用本地已下载的 prompts.json
//
// 脚本幂等：重复运行会先移除 prompts.json 中旧的 nbp-* 条目再写入新精选。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://raw.githubusercontent.com/jau123/nanobanana-trending-prompts/main/prompts/prompts.json";
const CURATED_PER_CATEGORY = 5;
const CURATED_GROUP = "灵感精选";
const ID_PREFIX = "nbp-";

const CATEGORY_ZH = {
    "UI & Graphic": "UI 与平面",
    "Product & Brand": "产品与品牌",
    "Poster Design": "海报设计",
    Photography: "摄影",
    "Food & Drink": "美食饮品",
    "Illustration & 3D": "插画与3D",
};

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const galleryPath = join(webRoot, "public", "gallery.json");
const promptsPath = join(webRoot, "public", "prompts.json");

async function loadSource() {
    const localPath = process.argv[2];
    if (localPath) {
        console.log(`读取本地源数据: ${localPath}`);
        return JSON.parse(readFileSync(localPath, "utf8"));
    }
    console.log(`拉取远程源数据: ${SOURCE_URL}`);
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);
    return response.json();
}

function truncateTitle(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
}

/** 去掉行首连续的 [占位符] 片段及分隔符，如 "[BRAND NAME] | [COLOR]:"、"[PERSON NAME]."、"[product]," */
function stripLeadingPlaceholders(line) {
    let out = line;
    let prev;
    do {
        prev = out;
        out = out.replace(/^\[[^\]]{0,60}\]\s*(?:[|:：.。,，+\-–—]\s*)*/, "").trim();
    } while (out !== prev);
    return out;
}

/** 从 prompt 正文生成卡片标题；JSON 结构化提示词取首个内容描述值，否则取首行首句 */
function deriveTitle(prompt, fallback) {
    const text = (prompt || "").trim();
    if (text.startsWith("{")) {
        const candidate = [...text.matchAll(/"((?:[^"\\]|\\.){10,160})"/g)]
            .map((match) => match[1].replace(/\\n/g, " "))
            .find(
                (value) =>
                    !/^[a-z0-9_\- ]+$/.test(value) && // 键名 / 纯技术小写串
                    !/^\d/.test(value) && // "8K ultra..."、"3:4" 等规格值
                    /[A-Za-z一-鿿]{4,}/.test(value),
            );
        if (candidate) return truncateTitle(candidate);
        return fallback;
    }
    // 行内先剥离占位符前缀；纯占位符行会变空被跳过，转而取下一行有效内容
    const lines = text.split(/\r?\n/).map((line) => stripLeadingPlaceholders(line.replace(/^[#>*\-\s"'`]+/, "").trim()));
    const firstLine = lines.find((line) => line.length >= 8) || lines.find(Boolean) || "";
    if (!firstLine) return fallback;
    const sentence = firstLine.match(/^(.{16,}?[.。!！?？])(?:\s|$)/);
    const title = (sentence ? sentence[1] : firstLine).replace(/^[\[\]{}\s]+/, "").replace(/[\s.。,，:：;；]+$/, "");
    return title.length >= 6 ? truncateTitle(title) : fallback;
}

function mapTags(categories) {
    return (categories || []).map((c) => CATEGORY_ZH[c] || c);
}

function toIsoDate(date) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

const source = await loadSource();
if (!Array.isArray(source) || source.length === 0) throw new Error("源数据为空或格式不符");
console.log(`源数据 ${source.length} 条`);

// ---------- 全量画廊 ----------
const fallbackTitle = (item) => `${mapTags(item.categories)[0] || "灵感"}提示词 #${item.rank ?? item.id}`;
const galleryItems = source.map((item) => ({
    id: `${ID_PREFIX}${item.id}`,
    title: deriveTitle(item.prompt, fallbackTitle(item)),
    prompt: item.prompt || "",
    coverUrl: item.image || "",
    tags: mapTags(item.categories),
    author: item.author_name || item.author || "",
    likes: item.likes ?? 0,
    views: item.views ?? 0,
    score: item.score ?? 0,
    date: item.date || "",
    sourceUrl: item.source_url || "",
}));

const gallery = {
    version: 1,
    generatedAt: new Date().toISOString(),
    attribution: {
        name: "NanoBanana Trending Prompts",
        author: "MeiGen.ai",
        url: "https://github.com/jau123/nanobanana-trending-prompts",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    },
    categories: Object.values(CATEGORY_ZH),
    items: galleryItems,
};
mkdirSync(dirname(galleryPath), { recursive: true });
writeFileSync(galleryPath, JSON.stringify(gallery));
console.log(`已写入 ${galleryPath}（${galleryItems.length} 条，${Math.round(JSON.stringify(gallery).length / 1024)} KB）`);

// ---------- 精选子集合并进内置库 ----------
const curatedIds = new Set();
for (const category of Object.keys(CATEGORY_ZH)) {
    source
        .filter((item) => (item.categories || []).includes(category))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, CURATED_PER_CATEGORY)
        .forEach((item) => curatedIds.add(item.id));
}
const curated = source
    .filter((item) => curatedIds.has(item.id))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((item) => ({
        id: `${ID_PREFIX}${item.id}`,
        title: deriveTitle(item.prompt, fallbackTitle(item)),
        coverUrl: item.image || "",
        prompt: item.prompt || "",
        tags: mapTags(item.categories),
        createdAt: toIsoDate(item.date),
        updatedAt: toIsoDate(item.date),
        group: CURATED_GROUP,
    }));

const promptsFile = JSON.parse(readFileSync(promptsPath, "utf8"));
const existing = (promptsFile.prompts || []).filter((item) => !String(item.id).startsWith(ID_PREFIX));
promptsFile.prompts = [...existing, ...curated];
writeFileSync(promptsPath, JSON.stringify(promptsFile, null, 4));
console.log(`已写入 ${promptsPath}（保留原有 ${existing.length} 条 + 精选 ${curated.length} 条，${Math.round(JSON.stringify(promptsFile).length / 1024)} KB）`);
