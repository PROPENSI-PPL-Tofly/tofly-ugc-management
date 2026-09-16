"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
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
  active: "Kontrak Active",
  expired: "Kontrak Expired",
  upcoming: "Kontrak Belum Mulai",
  none: "Belum Ada Kontrak",
};

const CONTRACT_TONES: Record<ContractStatus, PillTone> = {
  active: "success",
  expired: "danger",
  upcoming: "accent",
  none: "neutral",
};

const PRODUCTIVITY_TONES: Record<Productivity, PillTone> = {
  good: "success",
  watch: "warning",
  risk: "danger",
};

const COLUMNS = [
  "Creator",
  "Kontrak",
  "Progress Task",
  "On-time Rate",
  "Avg Revisi",
  "Produktivitas",
  "",
];

export function CreatorTable({ creators }: { creators: CreatorSummary[] }) {
  const [selected, setSelected] = useState<CreatorSummary | null>(null);

  if (creators.length === 0) {
    return (
      <div className="px-[18px] py-9 text-center text-[13px] text-muted">
        <p className="mb-1 font-semibold text-ink">Creator tidak ditemukan</p>
        <p>Ubah kata kunci atau filter untuk melihat creator lain.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {COLUMNS.map((column, index) => (
                <th
                  key={column || `actions-${index}`}
                  className="border-b border-line px-[18px] pb-2.5 text-left text-[11.5px] font-semibold text-muted"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creators.map((creator) => (
              <tr key={creator.id} className="align-middle hover:bg-[#FAFAF8]">
                <td className="border-b border-line px-[18px] py-3 text-[13px]">
                  <strong>{creator.name}</strong>
                  <p className="mt-0.5 text-xs text-muted">{creator.email}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[
                      creator.socials.instagram && `IG @${creator.socials.instagram}`,
                      creator.socials.tiktok && `TikTok @${creator.socials.tiktok}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone={CONTRACT_TONES[creator.contract.status]}>
                      {CONTRACT_LABELS[creator.contract.status]}
                    </Pill>
                    {creator.accessRevokeDate ? (
                      <Pill tone="danger">Akses dicabut {formatDate(creator.accessRevokeDate)}</Pill>
                    ) : null}
                  </div>
                </td>

                <td className="border-b border-line px-[18px] py-3 text-[13px]">
                  {formatContractWindow(creator.contract.startDate, creator.contract.endDate)}
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDaysRemaining(creator.contract.daysRemaining)}
                  </p>
                  {creator.contract.periodNumber > 0 ? (
                    <p className="mt-0.5 text-xs text-muted">
                      Periode {creator.contract.periodNumber}
                    </p>
                  ) : null}
                </td>

                <td className="border-b border-line px-[18px] py-3 text-[13px]">
                  <span className="mr-2 inline-block h-1.5 w-[90px] overflow-hidden rounded-full bg-paper align-middle">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${creator.progress.percent}%` }}
                    />
                  </span>
                  <span className="text-xs">
                    {creator.progress.submitted}/{creator.progress.total} konten terkirim
                  </span>
                </td>

                <td className="border-b border-line px-[18px] py-3 text-[13px]">
                  {formatPercent(creator.performance.onTimeRate)}
                </td>

                <td className="border-b border-line px-[18px] py-3 text-[13px]">
                  {formatRevisions(creator.performance.avgRevisions)}
                </td>

                <td className="border-b border-line px-[18px] py-3 text-[13px]">
                  <Pill tone={PRODUCTIVITY_TONES[creator.performance.productivity]}>
                    {creator.performance.productivityLabel}
                  </Pill>
                </td>

                <td className="border-b border-line px-[18px] py-3 text-[13px]">
                  <div className="flex gap-2">
                    <Button onClick={() => setSelected(creator)}>Detail</Button>
                    {/* A link, not a button: the content plan is a page, so it should open in
                        a new tab, be bookmarkable and survive a middle click. */}
                    <Link
                      href={`/admin/creators/${creator.id}/content-plan`}
                      className="rounded-[6px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-ink"
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
