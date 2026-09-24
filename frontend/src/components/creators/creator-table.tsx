"use client";

import Link from "next/link";
import { useState } from "react";
import { CreatorDetailModal } from "./creator-detail-modal";
import { PRODUCTIVITY_TONES } from "./productivity-tones";
import { contractTypePrefix } from "@/lib/creator-form";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import type { ContractStatus, CreatorSummary } from "@/lib/creators";
import {
  EMPTY,
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
} from "@/lib/format";

const CONTRACT_LABELS: Record<ContractStatus, string> = {
  active: "Kontrak aktif",
  expired: "Kontrak berakhir",
  upcoming: "Kontrak belum mulai",
  none: "Belum ada kontrak",
};

const CONTRACT_TONES: Record<ContractStatus, Tone> = {
  active: "green",
  expired: "red",
  upcoming: "accent",
  none: "neutral",
};

const COLUMNS: { label: string; numeric?: boolean }[] = [
  { label: "Creator" },
  { label: "Kontrak" },
  { label: "Progres konten" },
  { label: "Tepat waktu", numeric: true },
  { label: "Rata-rata revisi", numeric: true },
  { label: "Produktivitas" },
];

const HEAD = "border-b border-rule px-5 pb-2 pt-3 text-left text-xs font-semibold text-muted";

const CELL = "border-b border-rule-2 px-5 py-3 align-top text-[13px]";

const NUMERIC = `${CELL} text-right tabular-nums`;

function socials(creator: CreatorSummary): string[] {
  return [
    creator.socials.instagram && `Instagram @${creator.socials.instagram}`,
    creator.socials.tiktok && `TikTok @${creator.socials.tiktok}`,
  ].filter((entry): entry is string => Boolean(entry));
}

function contractNote(creator: CreatorSummary): string {
  const remaining = formatDaysRemaining(creator.contract.daysRemaining);
  const note =
    creator.contract.periodNumber > 1
      ? `${remaining}, periode ke-${creator.contract.periodNumber}`
      : remaining;

  return `${contractTypePrefix(creator.contract.type)}${note}`;
}

function EmptyState({ total }: { total: number }) {
  if (total === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-[15px] font-semibold">Belum ada creator yang terdaftar.</p>

        <p className="mt-1 text-[13px] text-muted">
          Creator muncul di sini begitu akunnya dibuat dan kontraknya dicatat.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-14 text-center">
      <p className="text-[15px] font-semibold">Tidak ada creator di halaman ini.</p>

      <p className="mt-1 text-[13px] text-muted">
        Daftar creator lebih pendek dari nomor halaman yang diminta.
      </p>

      <Link
        href="/admin/creators"
        className="mt-4 inline-block rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 active:bg-surface-2"
      >
        Ke halaman pertama
      </Link>
    </div>
  );
}

/**
 * One row per creator, the columns the admin scans for renewal
 * and allocation decisions.
 */
export function CreatorTable({ creators, total }: { creators: CreatorSummary[]; total: number }) {
  const [selectedCreator, setSelectedCreator] = useState<CreatorSummary | null>(null);

  if (creators.length === 0) {
    return <EmptyState total={total} />;
  }

  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Daftar creator beserta kontrak, progres dan performa
          </caption>

          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={column.numeric ? `${HEAD} text-right` : HEAD}
                >
                  {column.label}
                </th>
              ))}

              <th scope="col" className={HEAD}>
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {creators.map((creator) => (
              <tr key={creator.id} className="transition-colors hover:bg-surface-2">
                <td className={`${CELL} min-w-52`}>
                  <p className="text-sm font-semibold text-ink">{creator.name}</p>

                  <p className="mt-0.5 text-xs text-muted">{creator.email}</p>

                  {socials(creator).map((entry) => (
                    <p key={entry} className="text-xs text-muted">
                      {entry}
                    </p>
                  ))}

                  {creator.accessRevokeDate ? (
                    <p className="mt-1 text-xs font-semibold text-red-ink">
                      Akses dicabut {formatDate(creator.accessRevokeDate)}
                    </p>
                  ) : null}
                </td>

                <td className={CELL}>
                  <StatusDot tone={CONTRACT_TONES[creator.contract.status]}>
                    {CONTRACT_LABELS[creator.contract.status]}
                  </StatusDot>

                  {creator.contract.status === "none" ? (
                    <p className="mt-1 text-xs text-muted">{EMPTY}</p>
                  ) : (
                    <>
                      <p className="mt-1 whitespace-nowrap">
                        {formatContractWindow(creator.contract.startDate, creator.contract.endDate)}
                      </p>

                      <p className="text-xs text-muted">{contractNote(creator)}</p>
                    </>
                  )}
                </td>

                <td className={CELL}>
                  <p className="whitespace-nowrap">
                    {creator.progress.submitted}/{creator.progress.total} konten terkirim
                  </p>

                  <progress
                    value={creator.progress.percent}
                    max={100}
                    aria-label={`Progres ${creator.progress.percent}%`}
                    className="progress mt-2 block h-1.5 w-28"
                  >
                    {creator.progress.percent}%
                  </progress>
                </td>

                <td className={NUMERIC}>{formatPercent(creator.performance.onTimeRate)}</td>

                <td className={NUMERIC}>{formatRevisions(creator.performance.avgRevisions)}</td>

                <td className={CELL}>
                  <Pill tone={PRODUCTIVITY_TONES[creator.performance.productivity]}>
                    {creator.performance.productivityLabel}
                  </Pill>
                </td>

                <td className={`${CELL} whitespace-nowrap`}>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCreator(creator)}
                      className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 hover:bg-surface-2 active:bg-surface-2"
                    >
                      Detail
                    </button>

                    <Link
                      href={`/admin/creators/${encodeURIComponent(creator.id)}/content-plan`}
                      className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 hover:bg-surface-2 active:bg-surface-2"
                    >
                      Content Plan
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCreator ? (
        // Keyed by creator so switching rows remounts the modal rather than
        // leaving the previous creator's detail on screen while the next loads.
        <CreatorDetailModal
          key={selectedCreator.id}
          creatorId={selectedCreator.id}
          name={selectedCreator.name}
          onClose={() => setSelectedCreator(null)}
        />
      ) : null}
    </>
  );
}
