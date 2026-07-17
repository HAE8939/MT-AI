import { useEffect } from "react";
import type { ReactNode } from "react";
import { Check, MessageSquarePlus, Plus, Tag, Trash2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferencePurposeLabels } from "@/lib/image-reference-prompt";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasImageReferencePurpose, ContextMenuState } from "@/types/canvas";

const referencePurposeOptions: { value: CanvasImageReferencePurpose | undefined; label: string }[] = [
    { value: undefined, label: "无" },
    ...(Object.entries(imageReferencePurposeLabels) as [CanvasImageReferencePurpose, string][]).map(([value, label]) => ({ value, label })),
];

export function CanvasNodeContextMenu({
    menu,
    referencePurpose,
    showReferencePurpose = false,
    onClose,
    onDuplicate,
    onDelete,
    onSetReferencePurpose,
    onAddToChat,
}: {
    menu: ContextMenuState;
    referencePurpose?: CanvasImageReferencePurpose;
    showReferencePurpose?: boolean;
    onClose: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onSetReferencePurpose?: (purpose: CanvasImageReferencePurpose | undefined) => void;
    /** 把节点内容（图片/文字）一键加入右侧对话 */
    onAddToChat?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "node" ? <MenuButton icon={<Plus className="size-4" />} label="复制" onClick={onDuplicate} /> : null}
            {menu.type === "node" && onAddToChat ? <MenuButton icon={<MessageSquarePlus className="size-4" />} label="添加到对话" onClick={onAddToChat} /> : null}
            {menu.type === "node" && showReferencePurpose && onSetReferencePurpose ? (
                <>
                    <div className="mx-3 my-1 h-px" style={{ background: theme.toolbar.border }} />
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs opacity-50">
                        <Tag className="size-3.5" />
                        <span>参考用途</span>
                    </div>
                    {referencePurposeOptions.map((option) => (
                        <MenuButton
                            key={option.value || "none"}
                            icon={referencePurpose === option.value ? <Check className="size-4" /> : <span className="size-4" />}
                            label={option.label}
                            onClick={() => onSetReferencePurpose(option.value)}
                        />
                    ))}
                    <div className="mx-3 my-1 h-px" style={{ background: theme.toolbar.border }} />
                </>
            ) : null}
            <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}
