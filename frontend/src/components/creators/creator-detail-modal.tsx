"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ContentTags } from "@/components/contents/content-tags";
import { Button } from "@/components/ui/button";
import { DetailField } from "@/components/ui/detail-field";
import { Modal } from "@/components/ui/modal";
import { Pill, StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES } from "@/lib/content-labels";
import { fetchCreatorDetail, type CreatorDetail } from "@/lib/creators";
import {
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
} from "@/lib/format";
import { PRODUCTIVITY_TONES } from "./productivity-tones";
import { CONTRACT_TYPE_LABELS, contractTypePrefix } from "@/lib/creator-form";

/** Content history rows per page; keeps the modal short for creators with long contracts. */
const CONTENTS_PER_PAGE = 5;

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
            <DetailField label="Email">{detail.email}</DetailField>

            <DetailField label="Nomor telepon">{detail.phoneNumber ?? "—"}</DetailField>

            <DetailField label="Kontrak">
              {formatContractWindow(detail.contract.startDate, detail.contract.endDate)}

              <p className="mt-1 text-xs text-muted">
                Periode {detail.contract.periodNumber} ·{" "}
                {contractTypePrefix(detail.contract.type)}
                {formatDaysRemaining(detail.contract.daysRemaining)} · kuota{" "}
                {detail.contract.contentQuota} konten
              </p>
            </DetailField>

            <DetailField label="Akun media sosial">
              {[
                detail.socials.instagram && `IG @${detail.socials.instagram}`,
                detail.socials.tiktok && `TikTok @${detail.socials.tiktok}`,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </DetailField>
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

          <DetailField label="Riwayat kontrak">
            {detail.contractHistory.length === 0 ? (
              <p className="text-xs text-muted">Belum ada riwayat kontrak.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.contractHistory.map((period) => (
                  <li
                    key={period.id}
                    className="flex flex-wrap justify-between gap-2 border-b border-rule-2 py-1.5 text-xs last:border-none"
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
          </DetailField>

          <DetailField label="Riwayat konten">
            {detail.contents.length === 0 ? (
              <p className="text-xs text-muted">Belum ada konten pada periode ini.</p>
            ) : (
              // Columns so deadline and status line up row to row; long Evg_ names are cut
              // with the full name on hover. Scrolls on its own below the table's width.
              <div className="overflow-x-auto">
                <table aria-label="Riwayat konten" className="w-full min-w-[420px] table-fixed text-xs">
                  <thead>
                    <tr className="border-b border-rule text-left text-muted">
                      <th scope="col" className="py-1.5 pr-3 font-semibold">
                        Konten
                      </th>
                      <th scope="col" className="w-24 py-1.5 pr-3 font-semibold">
                        Deadline
                      </th>
                      <th scope="col" className="w-40 py-1.5 font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleContents.map((content) => (
                      <tr key={content.id} className="border-b border-rule-2 last:border-none">
                        <td className="py-2 pr-3">
                          <span title={content.name} className="block truncate text-ink">
                            {content.name}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-ink-2">
                          {formatDate(content.deadline)}
                        </td>
                        <td className="py-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <StatusDot tone={CONTENT_STATUS_TONES[content.status]}>
                              {CONTENT_STATUS_LABELS[content.status]}
                            </StatusDot>
                            <ContentTags tags={content.tags} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {contentTotal > CONTENTS_PER_PAGE ? (
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="text-xs text-muted tabular-nums">
                  {contentFirst + 1}–{contentLast} dari {contentTotal}
                </span>
                <Button
                  aria-label="Riwayat konten sebelumnya"
                  disabled={contentPage === 0}
                  onClick={() => setContentPage((page) => page - 1)}
                >
                  ‹
                </Button>
                <Button
                  aria-label="Riwayat konten berikutnya"
                  disabled={contentLast >= contentTotal}
                  onClick={() => setContentPage((page) => page + 1)}
                >
                  ›
                </Button>
              </div>
            ) : null}
          </DetailField>

          <DetailField label="Riwayat draft">
            {detail.drafts.length === 0 ? (
              <p className="text-xs text-muted">Belum ada draft yang dikirim.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.drafts.map((draft) => (
                  <li
                    key={draft.contentId}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-2 py-1.5 text-xs last:border-none"
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
          </DetailField>
        </>
      ) : null}
    </Modal>
  );
}
