"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import type { CreatorSummary, ContractStatus, Productivity } from "@/lib/creators";
import {
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
} from "@/lib/format";
import { CreatorDetailModal } from "./creator-detail-modal";

const CONTRACT_LABELS: Record<ContractStatus, string> = {
  active: "Kontrak aktif",
  expired: "Kontrak berakhir",
  upcoming: "Kontrak belum mulai",
  none: "Belum ada kontrak",
};

const CONTRACT_TONES: Record<ContractStatus, Tone> = {
  active: "green",
  expired: "red",
  upcoming: "blue",
  none: "neutral",
};

const PRODUCTIVITY_TONES: Record<Productivity, Tone> = {
  good: "green",
  watch: "amber",
  risk: "red",
};

const COLUMNS = ["Creator", "Kontrak", "Progress konten", "Tepat waktu", "Revisi", "Produktivitas"];

const CELL = "border-b border-line px-5 py-3.5 align-top text-[13px]";

function socials(creator: CreatorSummary): string[] {
  return [
    creator.socials.instagram && `Instagram @${creator.socials.instagram}`,
    creator.socials.tiktok && `TikTok @${creator.socials.tiktok}`,
  ].filter((entry): entry is string => Boolean(entry));
}

export function CreatorTable({ creators }: { creators: CreatorSummary[] }) {
  const [selected, setSelected] = useState<CreatorSummary | null>(null);

  if (creators.length === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-[15px] font-semibold">Creator tidak ditemukan</p>
        <p className="mt-1 text-[13px] text-muted">
          Ubah kata kunci atau filter untuk melihat creator lain.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-line px-5 pb-2.5 pt-3 text-left text-xs font-semibold text-muted"
                >
                  {column}
                </th>
              ))}
              <th scope="col" className="border-b border-line px-5">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {creators.map((creator) => (
              <tr key={creator.id} className="hover:bg-surface-low">
                <td className={CELL}>
                  <p className="text-sm font-semibold text-ink">{creator.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{creator.email}</p>
                  {socials(creator).map((entry) => (
                    <p key={entry} className="text-xs text-muted">
                      {entry}
                    </p>
                  ))}
                  {creator.accessRevokeDate ? (
                    <p className="mt-1 text-xs font-medium text-red">
                      Akses dicabut {formatDate(creator.accessRevokeDate)}
                    </p>
                  ) : null}
                </td>

                <td className={CELL}>
                  <StatusDot tone={CONTRACT_TONES[creator.contract.status]}>
                    {CONTRACT_LABELS[creator.contract.status]}
                  </StatusDot>
                  <p className="mt-1 text-[13px]">
                    {formatContractWindow(creator.contract.startDate, creator.contract.endDate)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDaysRemaining(creator.contract.daysRemaining)}
                    {creator.contract.periodNumber > 1
                      ? `, periode ke-${creator.contract.periodNumber}`
                      : ""}
                  </p>
                </td>

                <td className={CELL}>
                  <p className="text-[13px]">
                    {creator.progress.submitted}/{creator.progress.total} konten terkirim
                  </p>
                  <span
                    role="progressbar"
                    aria-valuenow={creator.progress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progress ${creator.progress.percent}%`}
                    className="mt-1.5 block h-1.5 w-28 overflow-hidden rounded-full bg-surface-low"
                  >
                    <span
                      className="block h-full rounded-full bg-blue"
                      style={{ width: `${creator.progress.percent}%` }}
                    />
                  </span>
                </td>

                <td className={`${CELL} tabular-nums`}>
                  {formatPercent(creator.performance.onTimeRate)}
                </td>

                <td className={`${CELL} tabular-nums`}>
                  {formatRevisions(creator.performance.avgRevisions)}
                </td>

                <td className={CELL}>
                  <Pill tone={PRODUCTIVITY_TONES[creator.performance.productivity]}>
                    {creator.performance.productivityLabel}
                  </Pill>
                </td>

                <td className={`${CELL} whitespace-nowrap`}>
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => setSelected(creator)}>Detail</Button>
                    {/* A link, not a button: the content plan is a page, so it should open in
                        a new tab, be bookmarkable and survive a middle click. */}
                    <Link
                      href={`/admin/creators/${creator.id}/content-plan`}
                      className="rounded-[var(--radius-control)] border border-blue bg-blue px-3 py-1.5 text-xs font-semibold text-white hover:border-blue-deep hover:bg-blue-deep"
                    >
                      Content plan
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <CreatorDetailModal
          creatorId={selected.id}
          name={selected.name}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
