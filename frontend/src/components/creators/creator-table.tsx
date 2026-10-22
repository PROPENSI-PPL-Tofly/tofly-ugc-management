"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRODUCTIVITY_TONES } from "./productivity-tones";
import { contractTypePrefix } from "@/lib/creator-form";
import { buttonClasses } from "@/components/ui/button-classes";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { useUrlQuery } from "@/lib/url-query";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import { creatorDetailBase } from "@/lib/creator-detail";
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

const LINK_BUTTON = buttonClasses();

/**
 * Why the table is empty. Three different situations, three different next steps: nobody has
 * been added yet, the search or filters matched nobody, or the page number is past the end.
 */
function EmptyRoster({
  total,
  filtered,
  onReset,
}: {
  total: number;
  filtered: boolean;
  onReset: () => void;
}) {
  if (total > 0) {
    return (
      <EmptyState
        title="Tidak ada creator di halaman ini."
        hint="Daftar creator lebih pendek dari nomor halaman yang diminta."
        action={
          <Link href="/admin/creators" className={LINK_BUTTON}>
            Ke halaman pertama
          </Link>
        }
      />
    );
  }

  if (filtered) {
    return (
      <FilteredEmpty
        title="Tidak ada creator yang cocok dengan pencarian atau filter."
        onReset={onReset}
      />
    );
  }

  return (
    <EmptyState
      title="Belum ada creator yang terdaftar."
      hint="Creator muncul di sini begitu akunnya dibuat dan kontraknya dicatat. Mulai dengan Tambah Creator."
    />
  );
}

/**
 * One row per creator, the columns the admin scans for renewal
 * and allocation decisions.
 */
export function CreatorTable({
  creators,
  total,
  filtered = false,
}: {
  creators: CreatorSummary[];
  total: number;
  /** Whether a search or filter narrowed the list, which changes what an empty list means. */
  filtered?: boolean;
}) {
  const router = useRouter();
  const { replaceQuery } = useUrlQuery();

  if (creators.length === 0) {
    // The way back from an empty search clears it and every filter, as the bar's Reset does.
    return <EmptyRoster total={total} filtered={filtered} onReset={() => replaceQuery("")} />;
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

              <th scope="col" className={HEAD} />
            </tr>
          </thead>

          <tbody>
            {creators.map((creator) => (
              // A press anywhere on the row opens the creator's page (PBI-4). The name is the
              // same door as a link, for the keyboard and for screen readers.
              <tr
                key={creator.id}
                onClick={() => {
                  // Dragging across a name to copy it ends in a click here: copying, not opening.
                  if (window.getSelection()?.toString()) return;
                  router.push(creatorDetailBase(creator.id));
                }}
                className="cursor-pointer transition-colors hover:bg-surface-2"
              >
                <td className={`${CELL} min-w-52`}>
                  <p className="text-sm font-semibold text-ink">
                    <Link
                      href={creatorDetailBase(creator.id)}
                      // The row would hear this press too and open the page a second time.
                      onClick={(event) => event.stopPropagation()}
                      className="hover:underline"
                    >
                      {creator.name}
                    </Link>
                  </p>

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
                  <Link
                    href={creatorDetailBase(creator.id)}
                    // Every row has one; the creator's name tells them apart when heard.
                    aria-label={`Detail ${creator.name}`}
                    // The row would hear this press too and open the page a second time.
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 hover:bg-surface-2 active:bg-surface-2"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
