"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelHead } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/pill";
import { Toast } from "@/components/ui/toast";
import { AddContentModal } from "@/components/contents/add-content-modal";
import {
    ContentDetailPanel,
    DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import {
    fetchCreatorDetail,
    type CreatorDetail,
} from "@/lib/creators";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES } from "@/lib/content-labels";
import { formatDate } from "@/lib/format";

const TABLE_HEAD =
    "border-b border-rule px-5 pb-2 pt-3 text-left text-xs font-semibold text-muted";

const TABLE_CELL =
    "border-b border-rule-2 px-5 py-3 align-top text-[13px]";

function contentTypeLabel(type: string): string {
    return type === "evergreen" ? "Evergreen" : "Specific";
}

/** Contents per page: a contract rarely has more, and the page stays scannable when it does. */
export const CONTENT_PLAN_PAGE_SIZE = 10;

export function ContentPlanClient({
                                      creatorId,
                                      page = 1,
                                  }: {
    creatorId: string;
    /** From the URL (?page=), so a page can be linked and reloaded; past the end shows the last. */
    page?: number;
}) {
    const [detail, setDetail] = useState<CreatorDetail | null>(null);
    const [error, setError] = useState("");
    const [showModal, setShowModal] = useState(false);
    // The content whose detail panel is open, so a row opens its own journey.
    const [openContentId, setOpenContentId] = useState<string | null>(null);
    // The id is the Toast key: a second save remounts it, restarting its countdown.
    const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
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
                setError("Content Plan gagal dimuat.");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [creatorId, refreshKey]);

    const currentContract =
        detail?.contractHistory.find((contract) => contract.isCurrent) ?? null;

    const contents = detail?.contents ?? [];

    // The whole contract arrives in one response; paging only slices what is shown.
    const totalPages = Math.max(1, Math.ceil(contents.length / CONTENT_PLAN_PAGE_SIZE));
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const pageContents = contents.slice(
        (currentPage - 1) * CONTENT_PLAN_PAGE_SIZE,
        currentPage * CONTENT_PLAN_PAGE_SIZE,
    );
    const basePath = `/admin/creators/${encodeURIComponent(creatorId)}/content-plan`;

    function reload() {
        setError("");
        setRefreshKey((current) => current + 1);
    }

    const evergreenCount = contents.filter(
        (content) => content.type === "evergreen",
    ).length;

    function handleSaved() {
        setDetail(null);
        setError("");
        setToast((current) => ({
            id: (current?.id ?? 0) + 1,
            message: "Konten berhasil ditambahkan.",
        }));
        setRefreshKey((current) => current + 1);
    }

    function renderPlan(): ReactNode {
        if (error) {
            return (
                <Panel>
                    <PanelHead
                        title="Content Plan"
                        hint="Jadwal konten creator"
                    />

                    <LoadError title={error} onRetry={reload} />
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

                    <EmptyState
                        title="Creator ini belum memiliki kontrak aktif."
                        hint="Konten hanya bisa dijadwalkan di dalam periode kontrak yang sedang berjalan."
                    />
                </Panel>
            );
        }

        return (
            <>
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
                        <EmptyState
                            title="Belum ada konten pada periode kontrak ini."
                            hint="Tambahkan konten untuk mengisi slot yang belum teralokasi."
                        />
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

                                    <th scope="col" className={TABLE_HEAD}>
                                        Aksi
                                    </th>
                                </tr>
                                </thead>

                                <tbody>
                                {pageContents.map((content) => (
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

                                        <td className={`${TABLE_CELL} whitespace-nowrap`}>
                                            <StatusDot tone={CONTENT_STATUS_TONES[content.status]}>
                                                {CONTENT_STATUS_LABELS[content.status]}
                                            </StatusDot>
                                        </td>

                                        <td className={TABLE_CELL}>
                                            <Button
                                                variant="ghost"
                                                onClick={() => setOpenContentId(content.id)}
                                            >
                                                Detail
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <Pagination
                        basePath={basePath}
                        noun="konten"
                        page={currentPage}
                        pageSize={CONTENT_PLAN_PAGE_SIZE}
                        total={contents.length}
                        totalPages={totalPages}
                    />
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

                {openContentId ? (
                    <ContentDetailPanel
                        key={openContentId}
                        contentId={openContentId}
                        role="admin"
                        onClose={() => setOpenContentId(null)}
                        // A decision closes the panel and re-fetches the schedule, so the
                        // decided row's status updates without a full page reload (#73).
                        onDecided={(decision) => {
                            setOpenContentId(null);
                            setRefreshKey((current) => current + 1);
                            setToast((current) => ({
                                id: (current?.id ?? 0) + 1,
                                message: DECISION_CONFIRMATIONS[decision],
                            }));
                        }}
                    />
                ) : null}
            </>
        );
    }

    // Rendered beside every state above, so the toast outlives the reload that follows a save.
    return (
        <>
            {renderPlan()}
            {toast ? (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    onDismiss={() => setToast(null)}
                />
            ) : null}
        </>
    );
}
