"use client";

import { useEffect, useMemo, useState } from "react";
import { AddContentModal } from "./add-content-modal";
import { Panel, PanelHead } from "@/components/ui/panel";
import { fetchCreatorDetail, type CreatorDetail } from "@/lib/creators";

interface ContentPlanClientProps {
    creatorId: string;
}

export function ContentPlanClient({
                                      creatorId,
                                  }: ContentPlanClientProps) {
    const [creator, setCreator] =
        useState<CreatorDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [toast, setToast] = useState("");

    async function load() {
        setLoading(true);
        setError("");

        try {
            const result = await fetchCreatorDetail(creatorId);
            setCreator(result);
        } catch {
            setError("Data Content Plan tidak bisa dimuat.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [creatorId]);

    const currentContract = useMemo(
        () =>
            creator?.contractHistory.find(
                (contract) => contract.isCurrent,
            ) ??
            creator?.contractHistory.at(-1) ??
            null,
        [creator],
    );

    const evergreenCount =
        creator?.contents.filter(
            (content) => content.type === "evergreen",
        ).length ?? 0;

    function showToast() {
        setToast("Konten berhasil ditambahkan.");

        window.setTimeout(() => {
            setToast("");
        }, 3000);
    }

    if (loading) {
        return (
            <Panel>
                <PanelHead
                    title="Content Plan"
                    hint="Memuat jadwal konten..."
                />
            </Panel>
        );
    }

    if (error || !creator) {
        return (
            <Panel>
                <div
                    className="px-5 py-6 text-sm text-danger"
                    role="alert"
                >
                    {error || "Creator tidak ditemukan."}
                </div>
            </Panel>
        );
    }

    return (
        <>
            <Panel>
                <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-4">
                    <div>
                        <PanelHead
                            title={`Content Plan — ${creator.name}`}
                            hint={
                                currentContract
                                    ? `${currentContract.startDate} sampai ${currentContract.endDate} · Kuota ${currentContract.contentQuota}`
                                    : "Creator belum memiliki kontrak."
                            }
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        disabled={!currentContract}
                        className="shrink-0 rounded-(--radius-control) bg-ink px-3 py-2 text-xs font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        + Tambah Konten
                    </button>
                </div>

                <div className="overflow-x-auto">
                    {creator.contents.length === 0 ? (
                        <div className="px-5 py-8 text-sm text-ink-3">
                            Belum ada konten dalam Content Plan.
                        </div>
                    ) : (
                        <table className="min-w-full text-left text-sm">
                            <thead className="border-b border-rule bg-surface-2">
                            <tr>
                                <th className="px-5 py-3 text-xs font-semibold text-ink-2">
                                    Tipe
                                </th>
                                <th className="px-5 py-3 text-xs font-semibold text-ink-2">
                                    Nama Konten
                                </th>
                                <th className="px-5 py-3 text-xs font-semibold text-ink-2">
                                    Deadline
                                </th>
                                <th className="px-5 py-3 text-xs font-semibold text-ink-2">
                                    Status
                                </th>
                            </tr>
                            </thead>

                            <tbody>
                            {creator.contents.map((content) => (
                                <tr
                                    key={content.id}
                                    className="border-b border-rule last:border-b-0"
                                >
                                    <td className="px-5 py-3">
                      <span className="rounded-full border border-rule px-2 py-1 text-[11px] font-semibold uppercase">
                        {content.type}
                      </span>
                                    </td>

                                    <td className="px-5 py-3 font-medium text-ink">
                                        {content.name}
                                    </td>

                                    <td className="px-5 py-3 text-ink-2">
                                        {content.deadline}
                                    </td>

                                    <td className="px-5 py-3 text-ink-2">
                                        {content.status}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Panel>

            {toast && (
                <div
                    className="fixed bottom-5 right-5 z-50 rounded-(--radius-control) border border-rule bg-surface px-4 py-3 text-sm font-semibold text-ink shadow-lg"
                    role="status"
                >
                    {toast}
                </div>
            )}

            {currentContract && (
                <AddContentModal
                    open={modalOpen}
                    creatorId={creator.id}
                    creatorName={creator.name}
                    quota={currentContract.contentQuota}
                    evergreenCount={evergreenCount}
                    contractStart={currentContract.startDate}
                    contractEnd={currentContract.endDate}
                    onClose={() => setModalOpen(false)}
                    onSaved={async () => {
                        await load();
                        showToast();
                    }}
                />
            )}
        </>
    );
}