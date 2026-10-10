"use client";

import { useState } from "react";
import {
  ContentDetailPanel,
  DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
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
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const { show: confirm, toast } = useToast();

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
                  {/* The status is the same for every queued draft, so a resubmit says so here. */}
                  {row.revisionCount > 0 ? (
                    <span className="ml-2 text-xs text-amber-ink">Dikirim ulang</span>
                  ) : null}
                </td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    // Every row has one; the content's name tells them apart when heard.
                    aria-label={`Lihat Detail: ${row.contentName}`}
                    onClick={() => setOpenContentId(row.contentId)}
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

      {openContentId ? (
        // Keyed by content so switching rows remounts the panel rather than leaving the
        // previous item on screen while the next loads. A decision refreshes the queue
        // and closes the panel, so the decided row drops out.
        <ContentDetailPanel
          key={openContentId}
          contentId={openContentId}
          role="admin"
          onClose={() => setOpenContentId(null)}
          onDecided={(decision) => {
            setOpenContentId(null);
            confirm(DECISION_CONFIRMATIONS[decision]);
          }}
        />
      ) : null}

      {toast}
    </>
  );
}
