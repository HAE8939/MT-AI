import { nanoid } from "nanoid";

import type { CosConfig, CosMediaKind } from "@/types/cos-media";

type CosObjectUrlInput = Pick<CosConfig, "bucket" | "region" | "publicBaseUrl"> & { key: string };
type CosUploadInput = { blob: Blob; fileName: string; kind: CosMediaKind; key?: string };

export function buildCosObjectKey(kind: CosMediaKind, fileName: string, date = new Date(), id = nanoid(), prefix = "mt-ai") {
    const extension = fileExtension(fileName);
    const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return [normalizedPrefix, kind, String(date.getUTCFullYear()), month, `${id}.${extension}`].filter(Boolean).join("/");
}

export function buildCosObjectUrl({ bucket, region, publicBaseUrl, key }: CosObjectUrlInput) {
    const baseUrl = publicBaseUrl.trim().replace(/\/+$/, "") || `https://${bucket.trim()}.cos.${region.trim()}.myqcloud.com`;
    return `${baseUrl}/${encodeObjectKey(key)}`;
}

export async function uploadCosObject(config: CosConfig, input: CosUploadInput, signal?: AbortSignal) {
    validateConfig(config);
    const key = input.key || buildCosObjectKey(input.kind, input.fileName, new Date(), nanoid(), config.objectPrefix);
    const url = buildCosObjectUrl({ ...config, key });
    const contentType = input.blob.type || "application/octet-stream";
    const headers = { "Content-Type": contentType };
    const authorization = await buildCosAuthorization(config, "PUT", key, headers);
    const response = await fetch(url, { method: "PUT", headers: { ...headers, Authorization: authorization }, body: input.blob, signal });
    if (!response.ok) throw new Error(await cosResponseError(response, "COS 上传失败"));
    return { key, url };
}

export async function deleteCosObject(config: CosConfig, key: string, signal?: AbortSignal) {
    validateConfig(config);
    const url = buildCosObjectUrl({ ...config, key });
    const authorization = await buildCosAuthorization(config, "DELETE", key, {});
    const response = await fetch(url, { method: "DELETE", headers: { Authorization: authorization }, signal });
    if (!response.ok && response.status !== 404) throw new Error(await cosResponseError(response, "COS 清理失败"));
}

export async function testCosConnection(config: CosConfig, signal?: AbortSignal) {
    const fileName = `connection-${Date.now()}.txt`;
    const key = buildCosObjectKey("assets", fileName, new Date(), nanoid(), `${config.objectPrefix}/health`);
    const uploaded = await uploadCosObject(config, { blob: new Blob(["1"], { type: "text/plain" }), fileName, kind: "assets", key }, signal);
    try {
        await deleteCosObject(config, uploaded.key, signal);
        return { ...uploaded, cleanupWarning: "" };
    } catch (error) {
        return { ...uploaded, cleanupWarning: error instanceof Error ? error.message : "测试对象清理失败" };
    }
}

async function buildCosAuthorization(config: CosConfig, method: string, key: string, headers: Record<string, string>) {
    const now = Math.floor(Date.now() / 1000);
    const keyTime = `${now};${now + 3600}`;
    const signKey = await hmacSha1(config.secretKey, keyTime);
    const headerKeys = Object.keys(headers).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const headerList = headerKeys.map((key) => key.toLowerCase()).join(";");
    const httpHeaders = headerKeys.map((key) => `${key.toLowerCase()}=${encodeURIComponent(headers[key])}`).join("&");
    const httpString = `${method.toLowerCase()}\n/${key}\n\n${httpHeaders}\n`;
    const stringToSign = `sha1\n${keyTime}\n${await sha1(httpString)}\n`;
    const signature = await hmacSha1(signKey, stringToSign);
    return [`q-sign-algorithm=sha1`, `q-ak=${config.secretId}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`, `q-header-list=${headerList}`, `q-url-param-list=`, `q-signature=${signature}`].join("&");
}

async function hmacSha1(key: string, value: string) {
    const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    return toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}

async function sha1(value: string) {
    return toHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
}

function toHex(value: ArrayBuffer) {
    return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeObjectKey(key: string) {
    return key.split("/").map(encodeURIComponent).join("/");
}

function fileExtension(fileName: string) {
    const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]{1,10})$/);
    return match?.[1] || "bin";
}

function validateConfig(config: CosConfig) {
    if (!config.enabled) throw new Error("腾讯云 COS 未启用");
    const missing = (["secretId", "secretKey", "bucket", "region"] as const).filter((key) => !config[key].trim());
    if (missing.length) throw new Error("腾讯云 COS 配置不完整");
}

async function cosResponseError(response: Response, fallback: string) {
    const body = (await response.text()).trim();
    return `${fallback}（HTTP ${response.status}）${body ? `：${body.slice(0, 300)}` : ""}`;
}
