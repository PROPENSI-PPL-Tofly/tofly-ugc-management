"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import {
  fetchCreatorDetail,
  type ContentOutcome,
  type ContentStatus,
  type CreatorDetail,
} from "@/lib/creators";
import {
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
} from "@/lib/format";
import { PRODUCTIVITY_TONES } from "./productivity-tones";
import { CONTRACT_TYPE_LABELS } from "@/lib/creator-form";

// A resolved content gets a judgement (on time or not) as a pill; one still in progress
// shows the plain fact of where it is in the workflow instead.
type ResolvedOutcome = Exclude<ContentOutcome, "open">;

const OUTCOME_LABELS: Record<ResolvedOutcome, string> = {
  on_time: "Tepat waktu",
  submitted_late: "Terlambat kirim",
  late: "Lewat deadline",
};

const OUTCOME_TONES: Record<ResolvedOutcome, Tone> = {
  on_time: "green",
  submitted_late: "amber",
  late: "red",
};

const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  scheduled: "Scheduled",
  draft_review: "Draft Menunggu Review",
  draft_revision: "Draft Perlu Revisi",
  draft_revised: "Draft Revised",
  draft_approved: "Draft Approved",
  link_submitted: "Content Link Submitted",
};

/** Content history rows per page; keeps the modal short for creators with long contracts. */
const CONTENTS_PER_PAGE = 5;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
  const [contentPage, setContentPage] = useState(0);

  // No reset on creatorId here: the caller keys this component by creator, so a
  // different creator is a different mount that starts from the initial state.
  // Resetting in the effect body would set state during render instead.
  useEffect(() => {
    let cancelled = false;

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

  const contentTotal = detail?.contents.length ?? 0;
  const contentFirst = contentPage * CONTENTS_PER_PAGE;
  const contentLast = Math.min(contentFirst + CONTENTS_PER_PAGE, contentTotal);
  const visibleContents = detail?.contents.slice(contentFirst, contentLast) ?? [];

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
              router.push(`/admin/creators/${encodeURIComponent(creatorId)}/content-plan`)
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
        <p className="py-6 text-center text-[13px] text-muted">Memuat detail creator...</p>
      ) : null}

      {detail ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Email">{detail.email}</Field>

            <Field label="Nomor telepon">{detail.phoneNumber ?? "—"}</Field>

            <Field label="Kontrak">
              {formatContractWindow(detail.contract.startDate, detail.contract.endDate)}

              <p className="mt-1 text-xs text-muted">
                Periode {detail.contract.periodNumber} ·{" "}
                {detail.contract.type ? `${CONTRACT_TYPE_LABELS[detail.contract.type]} · ` : ""}
                {formatDaysRemaining(detail.contract.daysRemaining)} · kuota{" "}
                {detail.contract.contentQuota} konten
              </p>
            </Field>

            <Field label="Akun media sosial">
              {[
                detail.socials.instagram && `IG @${detail.socials.instagram}`,
                detail.socials.tiktok && `TikTok @${detail.socials.tiktok}`,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-(--radius-control) border border-rule-2 px-3.5 py-3">
              <p className="text-xs text-muted">Progress</p>

              <p className="text-lg font-bold tabular-nums">
                {detail.progress.submitted}/{detail.progress.total}
              </p>
            </div>

            <div className="rounded-(--radius-control) border border-rule-2 px-3.5 py-3">
              <p className="text-xs text-muted">On-time</p>

              <p className="text-lg font-bold tabular-nums">
                {formatPercent(detail.performance.onTimeRate)}
              </p>
            </div>

            <div className="rounded-(--radius-control) border border-rule-2 px-3.5 py-3">
              <p className="text-xs text-muted">Avg revisi</p>

              <p className="text-lg font-bold tabular-nums">
                {formatRevisions(detail.performance.avgRevisions)}
              </p>
            </div>

            <div className="rounded-(--radius-control) border border-rule-2 px-3.5 py-3">
              <p className="text-xs text-muted">Produktivitas</p>

              <p className="mt-1">
                <Pill tone={PRODUCTIVITY_TONES[detail.performance.productivity]}>
                  {detail.performance.productivityLabel}
                </Pill>
              </p>
            </div>
          </div>

          <Field label="Riwayat kontrak">
            {detail.contractHistory.length === 0 ? (
              <p className="text-xs text-muted">Belum ada riwayat kontrak.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.contractHistory.map((period) => (
                  <li
                    key={period.id}
                    className="flex flex-wrap justify-between gap-2 border-b border-dashed border-rule-2 py-1.5 text-xs last:border-none"
                  >
                    <span>
                      Periode {period.periodNumber} ({CONTRACT_TYPE_LABELS[period.type]}):{" "}
                      {formatDate(period.startDate)} –{" "}
                      {formatDate(period.endDate)} · {period.contentQuota} konten
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
              <p className="text-xs text-muted">Belum ada konten pada periode ini.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {visibleContents.map((content) => (
                  <li
                    key={content.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-rule-2 py-1.5 text-xs last:border-none"
                  >
                    <span>{content.name}</span>

                    <span className="flex items-center gap-2 text-muted">
                      {formatDate(content.deadline)}

                      {content.outcome === "open" ? (
                        <StatusDot>{CONTENT_STATUS_LABELS[content.status]}</StatusDot>
                      ) : (
                        <Pill tone={OUTCOME_TONES[content.outcome]}>
                          {OUTCOME_LABELS[content.outcome]}
                        </Pill>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {contentTotal > CONTENTS_PER_PAGE ? (
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="text-xs text-muted tabular-nums">
                  {contentFirst + 1}–{contentLast} dari {contentTotal}
                </span>
                <Button
                  aria-label="Riwayat konten sebelumnya"
                  className="px-2! py-0.5!"
                  disabled={contentPage === 0}
                  onClick={() => setContentPage((page) => page - 1)}
                >
                  ‹
                </Button>
                <Button
                  aria-label="Riwayat konten berikutnya"
                  className="px-2! py-0.5!"
                  disabled={contentLast >= contentTotal}
                  onClick={() => setContentPage((page) => page + 1)}
                >
                  ›
                </Button>
              </div>
            ) : null}
          </Field>

          <Field label="Riwayat draft">
            {detail.drafts.length === 0 ? (
              <p className="text-xs text-muted">Belum ada draft yang dikirim.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.drafts.map((draft) => (
                  <li
                    key={draft.contentId}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-rule-2 py-1.5 text-xs last:border-none"
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
