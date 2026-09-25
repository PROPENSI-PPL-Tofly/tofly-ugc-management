"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHead } from "@/components/ui/panel";
import { AddContentModal } from "@/components/contents/add-content-modal";
import {
    fetchCreatorDetail,
    type CreatorDetail,
} from "@/lib/creators";
import { formatDate } from "@/lib/format";

const TABLE_HEAD =
    "border-b border-rule px-5 pb-2 pt-3 text-left text-xs font-semibold text-muted";

const TABLE_CELL =
    "border-b border-rule-2 px-5 py-3 align-top text-[13px]";

function contentTypeLabel(type: string): string {
    return type === "evergreen" ? "Evergreen" : "Specific";
}

function statusLabel(status: string): string {
    if (status === "scheduled") {
        return "Dijadwalkan";
    }

    return status;
}

export function ContentPlanClient({
                                      creatorId,
                                  }: {
    creatorId: string;
}) {
    const [detail, setDetail] = useState<CreatorDetail | null>(null);
    const [error, setError] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [toast, setToast] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const nextDetail = await fetchCreatorDetail(creatorId);

                if (cancelled) {
                    return;
                }

                setDetail(nextDetail);
                setError("");
            } catch {
                if (cancelled) {
                    return;
                }

                setDetail(null);
                setError("Content Plan gagal dimuat. Coba lagi.");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [creatorId, refreshKey]);

    const currentContract =
        detail?.contractHistory.find((contract) => contract.isCurrent) ?? null;

    const contents = detail?.contents ?? [];

    const evergreenCount = contents.filter(
        (content) => content.type === "evergreen",
    ).length;

    function handleSaved() {
        setDetail(null);
        setError("");
        setToast("Konten berhasil ditambahkan.");
        setRefreshKey((current) => current + 1);
    }

    if (error) {
        return (
            <Panel>
                <PanelHead
                    title="Content Plan"
                    hint="Jadwal konten creator"
                />

                <div className="px-5 pb-5">
                    <p role="alert" className="text-[13px] text-red-ink">
                        {error}
                    </p>
                </div>
            </Panel>
        );
    }

    if (!detail) {
        return (
            <Panel>
                <PanelHead
                    title="Content Plan"
                    hint="Jadwal konten creator"
                />

                <div className="px-5 pb-5">
                    <p className="text-[13px] text-muted">
                        Memuat jadwal konten...
                    </p>
                </div>
            </Panel>
        );
    }

    if (!currentContract) {
        return (
            <Panel>
                <PanelHead
                    title="Content Plan"
                    hint="Jadwal konten creator"
                />

                <div className="px-5 pb-5">
                    <p className="text-[13px] text-muted">
                        Creator ini belum memiliki kontrak aktif.
                    </p>
                </div>
            </Panel>
        );
    }

    return (
        <>
            {toast ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="mb-3 rounded-(--radius-control) border border-rule bg-surface px-4 py-3 text-[13px] text-ink shadow-whisper"
                >
                    {toast}
                </div>
            ) : null}

            <Panel>
                <PanelHead
                    title="Content Plan"
                    hint={`${detail.name} · Evergreen ${evergreenCount}/${currentContract.contentQuota} · ${Math.max(currentContract.contentQuota - evergreenCount, 0)} slot belum teralokasi`}
                    action={
                        <Button
                            variant="accent"
                            onClick={() => setShowModal(true)}
                        >
                            + Tambah Konten
                        </Button>
                    }
                />

                {contents.length === 0 ? (
                    <div className="px-5 pb-8 pt-4">
                        <p className="text-[13px] text-muted">
                            Belum ada konten pada periode kontrak ini.
                        </p>
                    </div>
                ) : (
                    <div className="relative overflow-x-auto">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">
                                Jadwal konten creator
                            </caption>

                            <thead>
                            <tr>
                                <th scope="col" className={TABLE_HEAD}>
                                    Konten
                                </th>

                                <th scope="col" className={TABLE_HEAD}>
                                    Jenis
                                </th>

                                <th scope="col" className={TABLE_HEAD}>
                                    Deadline
                                </th>

                                <th scope="col" className={TABLE_HEAD}>
                                    Status
                                </th>
                            </tr>
                            </thead>

                            <tbody>
                            {contents.map((content) => (
                                <tr
                                    key={content.id}
                                    className="transition-colors hover:bg-surface-2"
                                >
                                    <td className={`${TABLE_CELL} min-w-52`}>
                                        <p className="font-semibold text-ink">
                                            {content.name}
                                        </p>
                                    </td>

                                    <td className={TABLE_CELL}>
                                        {contentTypeLabel(content.type)}
                                    </td>

                                    <td className={`${TABLE_CELL} whitespace-nowrap`}>
                                        {formatDate(content.deadline)}
                                    </td>

                                    <td className={TABLE_CELL}>
                                        {statusLabel(content.status)}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>

            {showModal ? (
                <AddContentModal
                    contractId={currentContract.id}
                    evergreenCount={evergreenCount}
                    quota={currentContract.contentQuota}
                    contractStart={currentContract.startDate}
                    contractEnd={currentContract.endDate}
                    onClose={() => setShowModal(false)}
                    onSaved={handleSaved}
                />
            ) : null}
        </>
    );
}