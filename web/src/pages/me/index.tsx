import { useState } from "react";
import { Segmented } from "antd";
import { Bookmark, Clock3, FileText, Images } from "lucide-react";

import { WorkflowTaskList } from "@/components/layout/workflow-task-drawer";
import { AssetsSection } from "./assets-section";
import { PromptsSection } from "./prompts-section";

type MeSectionKey = "favorites" | "prompts" | "assets" | "records";

const sections: Array<{ key: MeSectionKey; label: string; icon: React.ReactNode }> = [
    { key: "favorites", label: "收藏", icon: <Bookmark className="size-4" /> },
    { key: "prompts", label: "我的提示词", icon: <FileText className="size-4" /> },
    { key: "assets", label: "素材", icon: <Images className="size-4" /> },
    { key: "records", label: "生成记录", icon: <Clock3 className="size-4" /> },
];

/** 「我的」个人空间：收藏 / 我的提示词 / 素材 / 生成记录 */
export default function MePage() {
    const [section, setSection] = useState<MeSectionKey>("favorites");

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
                <div className="mx-auto max-w-7xl">
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
                        <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">我的</h1>
                        <Segmented
                            value={section}
                            options={sections.map(({ key, label, icon }) => ({ value: key, label, icon }))}
                            onChange={(value) => setSection(value as MeSectionKey)}
                        />
                    </div>
                    {section === "favorites" ? <PromptsSection mode="favorites" /> : null}
                    {section === "prompts" ? <PromptsSection mode="prompts" /> : null}
                    {section === "assets" ? <AssetsSection /> : null}
                    {section === "records" ? (
                        <div className="max-w-3xl">
                            <p className="pb-4 text-sm text-stone-500 dark:text-stone-400">画布生成任务的历史记录，可定位到对应画布节点。</p>
                            <WorkflowTaskList />
                        </div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
