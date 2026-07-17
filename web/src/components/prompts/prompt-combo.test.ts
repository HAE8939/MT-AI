import { describe, expect, test } from "bun:test";

import { buildComboJson, buildComboText, cardsToDrafts, comboCardsFromJson, countComboKeys, draftsToCards, extractComboCardsFromText } from "./prompt-combo";

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

    test("全未勾选时输出空对象且组合文本回退正文", () => {
        const cards = [{ name: "场景", keys: [{ key: "时间", tags: [{ label: "清晨" }] }] }];
        expect(buildComboJson(cards)).toEqual({});
        expect(buildComboText("基础正文", cards)).toBe("基础正文");
    });
});

describe("comboCardsFromJson", () => {
    test("嵌套两级 JSON 转卡片且标签全部勾选", () => {
        expect(comboCardsFromJson({ 场景: { 时间: "清晨" } })).toEqual([{ name: "场景", keys: [{ key: "时间", tags: [{ label: "清晨", selected: true }] }] }]);
    });

    test("顶层标量值转「内容」卡片", () => {
        expect(comboCardsFromJson({ 风格: "赛博朋克" })).toEqual([{ name: "风格", keys: [{ key: "内容", tags: [{ label: "赛博朋克", selected: true }] }] }]);
    });

    test("字符串按分隔符拆分多标签并去重", () => {
        expect(comboCardsFromJson({ 材质: { 墙面: "乳胶漆、木饰面/乳胶漆" } })).toEqual([
            { name: "材质", keys: [{ key: "墙面", tags: [{ label: "乳胶漆", selected: true }, { label: "木饰面", selected: true }] }] },
        ]);
    });

    test("数组值逐元素转标签", () => {
        expect(comboCardsFromJson({ 渲染: { 细节: ["细节丰富", "质感通透"] } })).toEqual([
            { name: "渲染", keys: [{ key: "细节", tags: [{ label: "细节丰富", selected: true }, { label: "质感通透", selected: true }] }] },
        ]);
    });

    test("非对象输入返回 null", () => {
        expect(comboCardsFromJson(null)).toBeNull();
        expect(comboCardsFromJson([1, 2])).toBeNull();
        expect(comboCardsFromJson("text")).toBeNull();
    });

    test("与 buildComboJson 往返：全勾选无分隔符标签可无损还原", () => {
        const json = { 场景: { 时间: "清晨" }, 渲染: { 分辨率: "8K" } };
        expect(buildComboJson(comboCardsFromJson(json)!)).toEqual(json);
    });
});

describe("extractComboCardsFromText", () => {
    test("带 json 围栏及前后说明文字的文本可提取", () => {
        const text = '以下是分析结果：\n```json\n{ "场景": { "时间": "清晨" } }\n```\n希望对你有帮助。';
        expect(extractComboCardsFromText(text)).toEqual([{ name: "场景", keys: [{ key: "时间", tags: [{ label: "清晨", selected: true }] }] }]);
    });

    test("无围栏时取首末花括号子串", () => {
        const text = '结果：{ "场景": { "时间": "清晨" } } 完毕';
        expect(extractComboCardsFromText(text)).not.toBeNull();
    });

    test("纯散文返回 null", () => {
        expect(extractComboCardsFromText("这是一段没有 JSON 的说明文字。")).toBeNull();
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

    test("空行与空键被过滤", () => {
        expect(draftsToCards([{ name: "卡", keys: [{ key: "", tagsText: "a" }, { key: "键", tagsText: "\n\n" }] }])).toBeUndefined();
    });
});

describe("countComboKeys", () => {
    test("统计全部卡片的键值组数量", () => {
        expect(countComboKeys([
            { name: "a", keys: [{ key: "k1", tags: [{ label: "t" }] }, { key: "k2", tags: [{ label: "t" }] }] },
            { name: "b", keys: [{ key: "k3", tags: [{ label: "t" }] }] },
        ])).toBe(3);
    });
});
