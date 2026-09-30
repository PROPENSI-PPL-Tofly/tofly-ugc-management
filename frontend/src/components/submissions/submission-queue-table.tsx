"use client";

import { useState } from "react";
import { DraftPreviewModal } from "@/components/draft-review/draft-preview-modal";
import { ReviewActions } from "@/components/draft-review/review-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES } from "@/lib/content-labels";
import type { ContentStatus } from "@/lib/creators";
import { formatDate } from "@/lib/format";
import type { SubmissionQueueItem } from "@/lib/submissions";

function isContentStatus(status: string): status is ContentStatus {
  return Object.hasOwn(CONTENT_STATUS_LABELS, status);
}

const TYPE_LABELS: Record<string, string> = {
  evergreen: "Evergreen",
  specific: "Specific",
};

export function SubmissionQueueTable({
  items,
  filtered = false,
}: {
  items: SubmissionQueueItem[];
  /** Whether a search or filter narrowed the queue, which changes what an empty queue means. */
  filtered?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Whether the open draft's revision note form is showing; each draft starts without it.
  const [revising, setRevising] = useState(false);

  function openDraft(submissionId: string) {
    setRevising(false);
    setOpenId(submissionId);
  }

  if (items.length === 0) {
    return filtered ? (
      <EmptyState
        title="Tidak ada draft yang cocok dengan pencarian atau filter."
        hint="Periksa ejaan nama creator atau konten, atau longgarkan filternya."
      />
    ) : (
      <EmptyState
        title="Tidak ada draft yang menunggu review."
        hint="Draft baru muncul di sini begitu creator mengirimkannya."
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="px-5 py-3 font-semibold">Nama Kreator</th>
              <th className="px-5 py-3 font-semibold">Nama Konten</th>
              <th className="px-5 py-3 font-semibold">Tipe</th>
              <th className="px-5 py-3 font-semibold">Deadline</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.submissionId} className="border-b border-rule">
                <td className="px-5 py-3">{row.creatorName}</td>
                <td className="px-5 py-3">{row.contentName}</td>
                <td className="px-5 py-3">
                  {TYPE_LABELS[row.type.toLowerCase()] ?? row.type}
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {formatDate(row.deadline)}
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {isContentStatus(row.status) ? (
                    <StatusDot tone={CONTENT_STATUS_TONES[row.status]}>
                      {CONTENT_STATUS_LABELS[row.status]}
                    </StatusDot>
                  ) : (
                    row.status
                  )}
                </td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => openDraft(row.submissionId)}
                    className="cursor-pointer rounded-(--radius-control) border border-rule bg-surface px-2 py-1 text-xs font-semibold text-ink hover:border-ink-2"
                  >
                    Lihat Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId ? (
        // Keyed by submission so switching rows remounts the modal rather than leaving the
        // previous draft on screen while the next loads. A decision refreshes the queue
        // (inside ReviewActions) and closes the modal, so the decided row drops out.
        <DraftPreviewModal
          key={openId}
          submissionId={openId}
          onClose={() => setOpenId(null)}
          showClose={!revising}
          actions={
            <ReviewActions
              submissionId={openId}
              onDecided={() => setOpenId(null)}
              onFormToggle={setRevising}
            />
          }
        />
      ) : null}
    </>
  );
}
