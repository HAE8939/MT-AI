export async function flattenImageAnnotation(imageUrl: string, annotationCanvas: HTMLCanvasElement) {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = annotationCanvas.width;
    canvas.height = annotationCanvas.height;
    const context = canvas.getContext("2d");
    if (!context) return imageUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.drawImage(annotationCanvas, 0, 0);
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
