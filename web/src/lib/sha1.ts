// 纯 JS SHA-1 / HMAC-SHA1（RFC 3174 / RFC 2202）：
// 局域网 HTTP 等非安全上下文没有 crypto.subtle，COS 请求签名降级到这里。

const BLOCK_SIZE = 64;
const ROUND_KEYS = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];

function sha1Digest(message: Uint8Array): Uint8Array {
    const padded = new Uint8Array((((message.length + 8) >> 6) + 1) << 6);
    padded.set(message);
    padded[message.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((message.length * 8) / 0x100000000));
    view.setUint32(padded.length - 4, (message.length * 8) >>> 0);

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;
    const w = new Int32Array(80);
    for (let offset = 0; offset < padded.length; offset += BLOCK_SIZE) {
        for (let i = 0; i < 16; i += 1) w[i] = view.getInt32(offset + i * 4);
        for (let i = 16; i < 80; i += 1) {
            const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (n << 1) | (n >>> 31);
        }
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        for (let i = 0; i < 80; i += 1) {
            const round = (i / 20) | 0;
            const f = round === 0 ? (b & c) | (~b & d) : round === 2 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
            const t = (((a << 5) | (a >>> 27)) + f + e + ROUND_KEYS[round] + w[i]) | 0;
            e = d;
            d = c;
            c = (b << 30) | (b >>> 2);
            b = a;
            a = t;
        }
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
    }
    const digest = new Uint8Array(20);
    const digestView = new DataView(digest.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => digestView.setUint32(i * 4, h >>> 0));
    return digest;
}

function hmacSha1Digest(key: Uint8Array, message: Uint8Array): Uint8Array {
    const normalizedKey = key.length > BLOCK_SIZE ? sha1Digest(key) : key;
    const inner = new Uint8Array(BLOCK_SIZE + message.length);
    const outer = new Uint8Array(BLOCK_SIZE + 20);
    for (let i = 0; i < BLOCK_SIZE; i += 1) {
        inner[i] = 0x36 ^ (normalizedKey[i] ?? 0);
        outer[i] = 0x5c ^ (normalizedKey[i] ?? 0);
    }
    inner.set(message, BLOCK_SIZE);
    outer.set(sha1Digest(inner), BLOCK_SIZE);
    return sha1Digest(outer);
}

function toHex(bytes: Uint8Array) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sha1Hex(value: string) {
    return toHex(sha1Digest(new TextEncoder().encode(value)));
}

export function hmacSha1Hex(key: string, value: string) {
    return toHex(hmacSha1Digest(new TextEncoder().encode(key), new TextEncoder().encode(value)));
}
