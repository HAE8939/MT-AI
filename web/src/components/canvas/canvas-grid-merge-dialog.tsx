import { useEffect, useState } from "react";
import { Button, InputNumber, Modal, Segmented } from "antd";
import { LayoutGrid } from "lucide-react";

import type { GridMergeParams } from "@/lib/canvas/canvas-grid-merge";

const maxGridSize = 12;
const maxGap = 200;

export function CanvasGridMergeDialog({ count, open, onClose, onConfirm }: { count: number; open: boolean; onClose: () => void; onConfirm: (params: GridMergeParams) => void }) {
    const [rows, setRows] = useState(1);
    const [columns, setColumns] = useState(1);
    const [gap, setGap] = useState(0);
    const [background, setBackground] = useState("#ffffff");
    const total = rows * columns;
    const invalid = total < count;

    useEffect(() => {
        if (!open) return;
        const defaultColumns = Math.max(1, Math.ceil(Math.sqrt(count)));
        setColumns(defaultColumns);
        setRows(Math.max(1, Math.ceil(count / defaultColumns)));
        setGap(0);
        setBackground("#ffffff");
    }, [count, open]);

    return (
        <Modal title={null} open={open} onCancel={onClose} footer={null} width={420} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">宫格拼合</h2>
                    <p className="mt-1 text-sm opacity-60">将选中的 {count} 张图片拼合为一张宫格图，原图保留并连线</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <NumberField label="行数" min={1} max={maxGridSize} value={rows} onChange={(value) => setRows(clampNumber(value, 1, maxGridSize))} />
                    <NumberField label="列数" min={1} max={maxGridSize} value={columns} onChange={(value) => setColumns(clampNumber(value, 1, maxGridSize))} />
                </div>
                <NumberField label="间距 (px)" min={0} max={maxGap} value={gap} onChange={(value) => setGap(clampNumber(value, 0, maxGap))} />
                <label className="block space-y-2">
                    <span className="font-medium opacity-75">背景色</span>
                    <Segmented
                        className="w-full [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!flex-1"
                        value={background}
                        onChange={(value) => setBackground(value as string)}
                        options={[
                            { label: "白色", value: "#ffffff" },
                            { label: "黑色", value: "#000000" },
                            { label: "灰色", value: "#808080" },
                        ]}
                    />
                </label>
                <div className="rounded-xl border px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="opacity-60">宫格数量</span>
                        <span className={invalid ? "font-semibold text-red-400" : "font-semibold"}>{rows} × {columns} = {total} 格</span>
                    </div>
                    {invalid ? <p className="mt-2 text-xs text-red-400">行列乘积需不小于图片数量（{count} 张）</p> : null}
                </div>
                <Button type="primary" size="large" className="w-full" icon={<LayoutGrid className="size-4" />} disabled={invalid} onClick={() => onConfirm({ rows, columns, gap, background })}>
                    拼合为宫格图
                </Button>
            </div>
        </Modal>
    );
}

function NumberField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: string | number | null) => void }) {
    return (
        <label className="block space-y-2">
            <span className="font-medium opacity-75">{label}</span>
            <InputNumber className="w-full" min={min} max={max} precision={0} value={value} onChange={onChange} />
        </label>
    );
}

function clampNumber(value: string | number | null, min: number, max: number) {
    const numberValue = Number(value);
    return Math.min(max, Math.max(min, Math.round(Number.isFinite(numberValue) ? numberValue : min)));
}
