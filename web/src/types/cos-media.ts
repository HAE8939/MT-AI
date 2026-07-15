export type CosMediaKind = "images" | "videos" | "assets" | "results";
export type CosUploadStatus = "queued" | "uploading" | "succeeded" | "failed" | "cancelled";

export type CosConfig = {
    enabled: boolean;
    secretId: string;
    secretKey: string;
    bucket: string;
    region: string;
    publicBaseUrl: string;
    objectPrefix: string;
};

export type CosUploadTask = {
    id: string;
    mediaId: string;
    mediaKind: CosMediaKind;
    storageKey: string;
    fileName: string;
    mimeType: string;
    status: CosUploadStatus;
    attempt: number;
    cosKey?: string;
    cosUrl?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
};
