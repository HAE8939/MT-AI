import { saveAs } from "file-saver";

/** 从 URL 或 dataURL 载入图片元素（尽量允许跨域取像素） */
function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片加载失败，可能因跨域限制无法处理"));
        img.src = src;
    });
}

/** 下载任务结果图（data URL 直接下载，远端地址先抓取为 Blob） */
export async function downloadTaskImage(src: string, fileName: string) {
    if (src.startsWith("data:")) {
        saveAs(src, fileName);
        return;
    }
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    saveAs(blob, fileName);
}

/** 复制图片到剪贴板（转为 PNG 写入 clipboard） */
export async function copyTaskImageToClipboard(src: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("当前浏览器不支持复制图片");
    }
    const img = await loadImageElement(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布上下文");
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("图片转换失败");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/**
 * 图文合成下载：把提示词折行绘制在图片底部半透明白条上，导出 PNG。
 * 参考 DMDS downloadTaskImageWithCaption 的布局比例，用 React/浏览器 Canvas 重写。
 */
export async function downloadTaskImageWithCaption(src: string, caption: string, fileName: string) {
    const text = caption.trim();
    if (!text) throw new Error("暂无提示词");
    const img = await loadImageElement(src);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布上下文");

    ctx.drawImage(img, 0, 0);

    const padY = Math.max(10, Math.round(height * 0.01));
    const bottomGap = Math.max(12, Math.round(height * 0.01));
    const fontSize = Math.max(16, Math.round(width * 0.024));
    const lineHeight = fontSize * 1.5;
    const maxTextWidth = Math.round(width * 0.72);
    const font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

    ctx.font = font;
    const lines: string[] = [];
    let current = "";
    for (const ch of text) {
        const next = current + ch;
        if (ctx.measureText(next).width > maxTextWidth && current.length > 0) {
            lines.push(current);
            current = ch;
        } else {
            current = next;
        }
    }
    lines.push(current);

    const textBlockHeight = lines.length * lineHeight + padY * 2;
    const blockY = height - textBlockHeight - bottomGap;
    const blockW = Math.round(width * 0.86);
    const blockX = Math.round((width - blockW) / 2);
    const radius = Math.max(8, Math.round(width * 0.018));

    ctx.fillStyle = "rgba(128,128,128,0.4)";
    ctx.beginPath();
    ctx.roundRect(blockX, blockY, blockW, textBlockHeight, radius);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const centerX = width / 2;
    const centerY = blockY + textBlockHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => ctx.fillText(line, centerX, centerY + index * lineHeight));

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("图文合成失败");
    saveAs(blob, fileName);
}
