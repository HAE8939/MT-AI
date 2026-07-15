export type MaskRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type MaskSelection = {
    rect: MaskRect;
    maskWidth: number;
    maskHeight: number;
};

const DEFAULT_EXPAND_RATIO = 0.25;
const DEFAULT_MIN_MARGIN = 32;

/** 读取编辑蒙版（白色保留、透明可编辑）中可编辑区域的包围盒，坐标为蒙版像素坐标。 */
export async function readMaskSelectionRect(maskDataUrl: string): Promise<MaskSelection | null> {
    const mask = await loadImageElement(maskDataUrl);
    if (!mask) return null;
    const canvas = document.createElement("canvas");
    canvas.width = mask.naturalWidth || mask.width;
    canvas.height = mask.naturalHeight || mask.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) return null;
    context.drawImage(mask, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            if (data[(y * canvas.width + x) * 4 + 3] === 255) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0 || maxY < 0) return null;
    return {
        rect: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
        maskWidth: canvas.width,
        maskHeight: canvas.height,
    };
}

/** 将选区包围盒按比例外扩一定边距（提供给模型更多上下文），并 clamp 在图像范围内。 */
export function expandMaskRect(rect: MaskRect, imageWidth: number, imageHeight: number, expandRatio = DEFAULT_EXPAND_RATIO, minMargin = DEFAULT_MIN_MARGIN): MaskRect {
    const margin = Math.max(minMargin, Math.round(Math.max(rect.width, rect.height) * expandRatio));
    const x = Math.max(0, Math.floor(rect.x - margin));
    const y = Math.max(0, Math.floor(rect.y - margin));
    const right = Math.min(imageWidth, Math.ceil(rect.x + rect.width + margin));
    const bottom = Math.min(imageHeight, Math.ceil(rect.y + rect.height + margin));
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** 按绝对像素矩形裁剪图片；rect 坐标基于 referenceSize（默认与目标图片同尺寸），尺寸不一致时按比例换算。 */
export async function cropDataUrlRect(dataUrl: string, rect: MaskRect, referenceSize?: { width: number; height: number }) {
    const image = await loadImageElement(dataUrl);
    if (!image) return dataUrl;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const scaled = scaleRect(rect, referenceSize, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(scaled.width));
    canvas.height = Math.max(1, Math.round(scaled.height));
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(image, Math.round(scaled.x), Math.round(scaled.y), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

/**
 * 将 AI 生成的选区图按蒙版透明度合成回原图对应位置，返回完整尺寸的合成图。
 * 蒙版 alpha=255 处保留原图，alpha=0 处使用生成图，中间值（羽化边缘）按透明度渐变混合。
 */
export async function compositeMaskedRegion(sourceDataUrl: string, generatedDataUrl: string, maskDataUrl: string, region: MaskRect, regionSpace?: { width: number; height: number }) {
    const [source, generated, mask] = await Promise.all([loadImageElement(sourceDataUrl), loadImageElement(generatedDataUrl), loadImageElement(maskDataUrl)]);
    if (!source || !generated) return generatedDataUrl;
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    const scaled = scaleRect(region, regionSpace, sourceWidth, sourceHeight);
    const regionX = Math.max(0, Math.round(scaled.x));
    const regionY = Math.max(0, Math.round(scaled.y));
    const regionWidth = Math.max(1, Math.min(Math.round(scaled.width), sourceWidth - regionX));
    const regionHeight = Math.max(1, Math.min(Math.round(scaled.height), sourceHeight - regionY));

    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext("2d");
    if (!context) return generatedDataUrl;
    context.drawImage(source, 0, 0, sourceWidth, sourceHeight);

    const generatedPixels = readRegionPixels(generated, regionWidth, regionHeight);
    const maskPixels = mask ? readMaskRegionAlpha(mask, sourceWidth, sourceHeight, regionX, regionY, regionWidth, regionHeight) : null;
    if (!generatedPixels) return canvas.toDataURL("image/png");

    const regionData = context.getImageData(regionX, regionY, regionWidth, regionHeight);
    const pixels = regionData.data;
    for (let index = 0; index < pixels.length; index += 4) {
        const keep = maskPixels ? maskPixels[index + 3] / 255 : 0;
        pixels[index] = Math.round(pixels[index] * keep + generatedPixels[index] * (1 - keep));
        pixels[index + 1] = Math.round(pixels[index + 1] * keep + generatedPixels[index + 1] * (1 - keep));
        pixels[index + 2] = Math.round(pixels[index + 2] * keep + generatedPixels[index + 2] * (1 - keep));
        pixels[index + 3] = 255;
    }
    context.putImageData(regionData, regionX, regionY);
    return canvas.toDataURL("image/png");
}

/** 将渐变蒙版还原为二值蒙版（任何非完全保留的像素都视为可编辑），供 images/edits 通道使用。 */
export async function binarizeMaskDataUrl(maskDataUrl: string) {
    const mask = await loadImageElement(maskDataUrl);
    if (!mask) return maskDataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = mask.naturalWidth || mask.width;
    canvas.height = mask.naturalHeight || mask.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) return maskDataUrl;
    context.drawImage(mask, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < imageData.data.length; index += 4) {
        imageData.data[index] = imageData.data[index] === 255 ? 255 : 0;
    }
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
}

function scaleRect(rect: MaskRect, referenceSize: { width: number; height: number } | undefined, targetWidth: number, targetHeight: number): MaskRect {
    if (!referenceSize?.width || !referenceSize?.height) return rect;
    const scaleX = targetWidth / referenceSize.width;
    const scaleY = targetHeight / referenceSize.height;
    return { x: rect.x * scaleX, y: rect.y * scaleY, width: rect.width * scaleX, height: rect.height * scaleY };
}

function readRegionPixels(image: HTMLImageElement, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, image.naturalWidth || image.width, image.naturalHeight || image.height, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
}

function readMaskRegionAlpha(mask: HTMLImageElement, sourceWidth: number, sourceHeight: number, x: number, y: number, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(mask, 0, 0, sourceWidth, sourceHeight);
    return context.getImageData(x, y, width, height).data;
}

function loadImageElement(dataUrl: string) {
    return new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        if (!dataUrl.startsWith("data:")) image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = dataUrl;
    });
}
