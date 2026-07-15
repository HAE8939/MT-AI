export type AnnotationTextObject = {
    id: string;
    content: string;
    /** 文字锚点，图片自然像素坐标，x 为左侧、y 为垂直中心 */
    x: number;
    y: number;
    /** 字号，图片自然像素单位 */
    fontSize: number;
    color: string;
    fontFamily: string;
};

export const annotationFontFamily = "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";

export function createTextObject(partial: Omit<AnnotationTextObject, "id" | "fontFamily"> & { fontFamily?: string }): AnnotationTextObject {
    return {
        ...partial,
        id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        fontFamily: partial.fontFamily || annotationFontFamily,
    };
}

/** 以文字对象的字号构造 canvas font 字符串 */
export function textObjectFont(text: AnnotationTextObject) {
    return `600 ${text.fontSize}px ${text.fontFamily || annotationFontFamily}`;
}

/** 测量文字对象在图片自然坐标下的包围盒 */
export function measureTextObject(context: CanvasRenderingContext2D, text: AnnotationTextObject) {
    context.save();
    context.font = textObjectFont(text);
    const width = context.measureText(text.content || " ").width;
    context.restore();
    return { width, height: text.fontSize };
}

/** 命中检测：返回位于 (x, y) 处最上层的文字对象 */
export function findTextObjectAt(context: CanvasRenderingContext2D, texts: AnnotationTextObject[], x: number, y: number) {
    for (let index = texts.length - 1; index >= 0; index -= 1) {
        const text = texts[index];
        const { width, height } = measureTextObject(context, text);
        const padding = text.fontSize * 0.3;
        if (x >= text.x - padding && x <= text.x + width + padding && y >= text.y - height / 2 - padding && y <= text.y + height / 2 + padding) {
            return text;
        }
    }
    return null;
}

/** 把文字层绘制到指定 context（图片自然坐标） */
export function drawTextObjects(context: CanvasRenderingContext2D, texts: AnnotationTextObject[]) {
    context.save();
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.globalCompositeOperation = "source-over";
    for (const text of texts) {
        if (!text.content) continue;
        context.font = textObjectFont(text);
        context.fillStyle = text.color;
        context.fillText(text.content, text.x, text.y);
    }
    context.restore();
}

/** 合成原图 + 画笔层 + 文字层，导出 PNG dataUrl */
export async function flattenAnnotation(imageUrl: string, annotationCanvas: HTMLCanvasElement, texts: AnnotationTextObject[]) {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = annotationCanvas.width;
    canvas.height = annotationCanvas.height;
    const context = canvas.getContext("2d");
    if (!context) return imageUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.drawImage(annotationCanvas, 0, 0);
    drawTextObjects(context, texts);
    return canvas.toDataURL("image/png");
}

function loadImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片加载失败"));
        image.src = url;
    });
}
