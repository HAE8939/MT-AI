export type CompressImageResult = {
    dataUrl: string;
    width: number;
    height: number;
    compressed: boolean;
    originalWidth: number;
    originalHeight: number;
};

export function compressImageToMaxSize(dataUrl: string, maxSize = 2048, quality = 0.9) {
    return new Promise<CompressImageResult>((resolve) => {
        if (!dataUrl) {
            resolve({ dataUrl, width: 0, height: 0, compressed: false, originalWidth: 0, originalHeight: 0 });
            return;
        }
        const image = new Image();
        const fallback = () => resolve({ dataUrl, width: image.naturalWidth || 0, height: image.naturalHeight || 0, compressed: false, originalWidth: image.naturalWidth || 0, originalHeight: image.naturalHeight || 0 });
        image.onload = () => {
            const width = image.naturalWidth;
            const height = image.naturalHeight;
            if (!width || !height || (width <= maxSize && height <= maxSize)) return fallback();
            const scale = maxSize / Math.max(width, height);
            const targetWidth = Math.max(1, Math.round(width * scale));
            const targetHeight = Math.max(1, Math.round(height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const context = canvas.getContext("2d");
            if (!context) return fallback();
            context.drawImage(image, 0, 0, targetWidth, targetHeight);
            resolve({ dataUrl: canvas.toDataURL("image/jpeg", quality), width: targetWidth, height: targetHeight, compressed: true, originalWidth: width, originalHeight: height });
        };
        image.onerror = fallback;
        image.src = dataUrl;
    });
}
