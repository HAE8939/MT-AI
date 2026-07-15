export type GridMergeParams = {
    rows: number;
    columns: number;
    gap: number;
    background: string;
};

export async function mergeImagesToGrid(dataUrls: string[], params: GridMergeParams) {
    const rows = Math.max(1, Math.floor(params.rows));
    const columns = Math.max(1, Math.floor(params.columns));
    const gap = Math.max(0, Math.floor(params.gap));
    const images = await Promise.all(dataUrls.slice(0, rows * columns).map(loadImage));
    if (!images.length) throw new Error("没有可拼合的图片");

    const cellWidth = Math.max(1, ...images.map((image) => image.naturalWidth));
    const cellHeight = Math.max(1, ...images.map((image) => image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = cellWidth * columns + gap * (columns - 1);
    canvas.height = cellHeight * rows + gap * (rows - 1);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建画布");

    context.fillStyle = params.background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    images.forEach((image, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = column * (cellWidth + gap);
        const y = row * (cellHeight + gap);
        const scale = Math.max(cellWidth / image.naturalWidth, cellHeight / image.naturalHeight);
        const sw = cellWidth / scale;
        const sh = cellHeight / scale;
        const sx = (image.naturalWidth - sw) / 2;
        const sy = (image.naturalHeight - sh) / 2;
        context.drawImage(image, sx, sy, sw, sh, x, y, cellWidth, cellHeight);
    });

    return canvas.toDataURL("image/png");
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片加载失败"));
        image.src = dataUrl;
    });
}
