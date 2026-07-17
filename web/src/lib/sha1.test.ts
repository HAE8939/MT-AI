import { describe, expect, test } from "bun:test";

import { hmacSha1Hex, sha1Hex } from "./sha1";

// Bun 环境自带 WebCrypto，作为纯 JS 实现的对照基准
async function subtleSha1Hex(value: string) {
    return toHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
}

async function subtleHmacSha1Hex(key: string, value: string) {
    const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    return toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}

function toHex(value: ArrayBuffer) {
    return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("sha1Hex 标准向量（RFC 3174 / FIPS 180）", () => {
    test("空串", () => {
        expect(sha1Hex("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    });
    test("abc", () => {
        expect(sha1Hex("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    });
    test("两块消息", () => {
        expect(sha1Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("84983e441c3bd26ebaae4aa1f95129e5e54670f1");
    });
});

describe("hmacSha1Hex 标准向量（RFC 2202）", () => {
    test("case 1：20 字节 0x0b 密钥", () => {
        expect(hmacSha1Hex("\x0b".repeat(20), "Hi There")).toBe("b617318655057264e28bc0b6fb378c8ef146be00");
    });
    test("case 2：Jefe", () => {
        expect(hmacSha1Hex("Jefe", "what do ya want for nothing?")).toBe("effcdf6ae5eb2fa2d27416d5f184df9c259a7c79");
    });
});

describe("与 WebCrypto 对照（覆盖填充边界 / 中文 / 超长密钥 / COS 签名串形态）", () => {
    // 55/56/64 字节是 SHA-1 填充分块的经典边界
    const messages = ["a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "x".repeat(1000), "无限画布 AI 创作工作台：中文多字节内容", "put\n/mt-ai/images/2026/07/abc.png\n\ncontent-type=image%2Fpng\n", "sha1\n1784288279;1784291879\n0123456789abcdef0123456789abcdef01234567\n"];

    test("sha1 与 WebCrypto 一致", async () => {
        for (const message of messages) {
            expect(sha1Hex(message)).toBe(await subtleSha1Hex(message));
        }
    });

    test("hmac 与 WebCrypto 一致（含大于 64 字节需先哈希的密钥）", async () => {
        const keys = ["secretKeyExample", "k".repeat(64), "k".repeat(65), "K".repeat(200), "1784288279;1784291879", "b617318655057264e28bc0b6fb378c8ef146be00"];
        for (const key of keys) {
            for (const message of messages) {
                expect(hmacSha1Hex(key, message)).toBe(await subtleHmacSha1Hex(key, message));
            }
        }
    });
});
