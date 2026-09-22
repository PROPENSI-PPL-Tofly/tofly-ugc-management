"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, type Tone } from "@/components/ui/pill";
import {
    fetchCreatorDetail,
    type ContentOutcome,
    type CreatorDetail,
} from "@/lib/creators";
import {
    formatContractWindow,
    formatDate,
    formatDaysRemaining,
    formatPercent,
    formatRevisions,
} from "@/lib/format";

const OUTCOME_LABELS: Record<ContentOutcome, string> = {
    on_time: "Tepat waktu",
    submitted_late: "Terlambat kirim",
    late: "Lewat deadline",
    open: "Berjalan",
};

const OUTCOME_TONES: Record<ContentOutcome, Tone> = {
    on_time: "green",
    submitted_late: "amber",
    late: "red",
    open: "neutral",
};

function Field({
                   label,
                   children,
               }: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <p className="mb-1 text-[12.5px] font-semibold">{label}</p>
            <div className="text-[13px]">{children}</div>
        </div>
    );
}

export function CreatorDetailModal({
                                       creatorId,
                                       name,
                                       onClose,
                                   }: {
    creatorId: string;
    name: string;
    onClose: () => void;
}) {
    const router = useRouter();

    const [detail, setDetail] = useState<CreatorDetail | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        setDetail(null);
        setFailed(false);

        fetchCreatorDetail(creatorId)
            .then((loaded) => {
                if (!cancelled) {
                    setDetail(loaded);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setFailed(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [creatorId]);

    return (
        <Modal
            title={name}
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Tutup
                    </Button>

                    <Button
                        variant="accent"
                        onClick={() =>
                            router.push(
                                `/admin/creators/${encodeURIComponent(creatorId)}/content-plan`,
                            )
                        }
                    >
                        Lihat Content Plan
                    </Button>
                </>
            }
        >
            {failed ? (
                <p className="py-6 text-center text-[13px] text-red-ink">
                    Gagal memuat detail creator. Coba tutup dan buka lagi.
                </p>
            ) : null}

            {!failed && !detail ? (
                <p className="py-6 text-center text-[13px] text-muted">
                    Memuat detail creator...
                </p>
            ) : null}

            {detail ? (
                <>
                    <div className="grid gap-3.5 sm:grid-cols-2">
                        <Field label="Email">{detail.email}</Field>

                        <Field label="Nomor telepon">
                            {detail.phoneNumber ?? "—"}
                        </Field>

                        <Field label="Kontrak">
                            {formatContractWindow(
                                detail.contract.startDate,
                                detail.contract.endDate,
                            )}

                            <p className="mt-1 text-xs text-muted">
                                Periode {detail.contract.periodNumber} ·{" "}
                                {formatDaysRemaining(detail.contract.daysRemaining)} · kuota{" "}
                                {detail.contract.contentQuota} konten
                            </p>
                        </Field>

                        <Field label="Akun media sosial">
                            {[
                                detail.socials.instagram &&
                                `IG @${detail.socials.instagram}`,
                                detail.socials.tiktok &&
                                `TikTok @${detail.socials.tiktok}`,
                            ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-[10px] border border-line px-3.5 py-3">
                            <p className="text-xs text-muted">Progress</p>

                            <p className="font-heading text-lg font-bold">
                                {detail.progress.submitted}/{detail.progress.total}
                            </p>
                        </div>

                        <div className="rounded-[10px] border border-line px-3.5 py-3">
                            <p className="text-xs text-muted">On-time</p>

                            <p className="font-heading text-lg font-bold">
                                {formatPercent(detail.performance.onTimeRate)}
                            </p>
                        </div>

                        <div className="rounded-[10px] border border-line px-3.5 py-3">
                            <p className="text-xs text-muted">Avg revisi</p>

                            <p className="font-heading text-lg font-bold">
                                {formatRevisions(detail.performance.avgRevisions)}
                            </p>
                        </div>

                        <div className="rounded-[10px] border border-line px-3.5 py-3">
                            <p className="text-xs text-muted">Produktivitas</p>

                            <p className="mt-1">
                                <Pill
                                    tone={
                                        detail.performance.productivity === "good"
                                            ? "green"
                                            : detail.performance.productivity === "risk"
                                                ? "red"
                                                : "amber"
                                    }
                                >
                                    {detail.performance.productivityLabel}
                                </Pill>
                            </p>
                        </div>
                    </div>

                    <Field label="Riwayat kontrak">
                        {detail.contractHistory.length === 0 ? (
                            <p className="text-xs text-muted">
                                Belum ada riwayat kontrak.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {detail.contractHistory.map((period) => (
                                    <li
                                        key={period.id}
                                        className="flex flex-wrap justify-between gap-2 border-b border-dashed border-line py-1.5 text-xs last:border-none"
                                    >
                    <span>
                      Periode {period.periodNumber}:{" "}
                        {formatDate(period.startDate)} –{" "}
                        {formatDate(period.endDate)} ·{" "}
                        {period.contentQuota} konten
                    </span>

                                        <span className="text-muted">
                      {period.completed}/{period.total} selesai
                                            {period.isCurrent ? " · berjalan" : ""}
                    </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Field>

                    <Field label="Riwayat konten">
                        {detail.contents.length === 0 ? (
                            <p className="text-xs text-muted">
                                Belum ada konten pada periode ini.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {detail.contents.map((content) => (
                                    <li
                                        key={content.id}
                                        className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line py-1.5 text-xs last:border-none"
                                    >
                                        <span>{content.name}</span>

                                        <span className="flex items-center gap-2 text-muted">
                      {formatDate(content.deadline)}

                                            <Pill tone={OUTCOME_TONES[content.outcome]}>
                        {OUTCOME_LABELS[content.outcome]}
                      </Pill>
                    </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Field>

                    <Field label="Riwayat draft">
                        {detail.drafts.length === 0 ? (
                            <p className="text-xs text-muted">
                                Belum ada draft yang dikirim.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {detail.drafts.map((draft) => (
                                    <li
                                        key={draft.contentId}
                                        className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line py-1.5 text-xs last:border-none"
                                    >
                                        <span>{draft.contentName}</span>

                                        <span className="text-muted">
                      {formatRevisions(draft.revisionCount)} revisi ·{" "}
                                            {formatDate(draft.lastSubmittedAt)}
                    </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Field>
                </>
            ) : null}
        </Modal>
    );
}