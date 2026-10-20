"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRODUCTIVITY_TONES } from "./productivity-tones";
import { contractTypePrefix } from "@/lib/creator-form";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import { DEFAULT_CREATOR_DETAIL_PARAMS, creatorDetailHref } from "@/lib/creator-detail";
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

// Below lg a row reads as a card, as Task Saya's rows do: cells stack, the row carries the
// rule, and a value names its column from data-label since the header row is hidden.
const CELL =
  "border-b border-rule-2 px-5 py-3 align-top text-[13px] max-lg:block max-lg:border-0 max-lg:px-0 max-lg:py-1";

const LABELLED =
  "max-lg:flex max-lg:items-start max-lg:gap-2 max-lg:before:w-28 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

const NUMERIC = `${CELL} ${LABELLED} text-right tabular-nums max-lg:text-left`;

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
function EmptyRoster({ total, filtered }: { total: number; filtered: boolean }) {
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
      <EmptyState
        title="Tidak ada creator yang cocok dengan pencarian atau filter."
        hint="Periksa ejaan nama atau email, atau longgarkan filternya."
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
  returnTo,
}: {
  creators: CreatorSummary[];
  total: number;
  /** Whether a search or filter narrowed the list, which changes what an empty list means. */
  filtered?: boolean;
  /** This view of the roster as its query, for the creator's page to lead back to. */
  returnTo?: string;
}) {
  const router = useRouter();
  const opened = returnTo
    ? { ...DEFAULT_CREATOR_DETAIL_PARAMS, back: returnTo }
    : DEFAULT_CREATOR_DETAIL_PARAMS;

  if (creators.length === 0) {
    return <EmptyRoster total={total} filtered={filtered} />;
  }

  return (
    <>
      <div className="relative overflow-x-auto">
        {/* Explicit roles: a table whose display changes can lose its semantics in some browsers. */}
        <table role="table" className="w-full border-collapse max-lg:block">
          <caption className="sr-only">
            Daftar creator beserta kontrak, progres dan performa
          </caption>

          <thead role="rowgroup" className="max-lg:sr-only">
            <tr role="row">
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  role="columnheader"
                  scope="col"
                  className={column.numeric ? `${HEAD} text-right` : HEAD}
                >
                  {column.label}
                </th>
              ))}

              <th role="columnheader" scope="col" className={HEAD}>
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>

          <tbody role="rowgroup" className="max-lg:block">
            {creators.map((creator) => (
              // A press anywhere on the row opens the creator's page (PBI-4). The link in the
              // last cell is the same door for the keyboard and for screen readers.
              <tr
                key={creator.id}
                role="row"
                onClick={() => {
                  // Dragging across a name to copy it ends in a click here: copying, not opening.
                  if (window.getSelection()?.toString()) return;
                  router.push(creatorDetailHref(creator.id, opened));
                }}
                className="cursor-pointer transition-colors hover:bg-surface-2 max-lg:block max-lg:border-b max-lg:border-rule max-lg:px-5 max-lg:py-3 max-lg:last:border-none"
              >
                <td role="cell" className={`${CELL} min-w-52 wrap-anywhere max-lg:min-w-0`}>
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

                <td role="cell" data-label="Kontrak" className={`${CELL} ${LABELLED}`}>
                  <div className="min-w-0">
                    <StatusDot tone={CONTRACT_TONES[creator.contract.status]}>
                      {CONTRACT_LABELS[creator.contract.status]}
                    </StatusDot>

                    {creator.contract.status === "none" ? (
                      <p className="mt-1 text-xs text-muted">{EMPTY}</p>
                    ) : (
                      <>
                        <p className="mt-1 whitespace-nowrap max-lg:whitespace-normal">
                          {formatContractWindow(
                            creator.contract.startDate,
                            creator.contract.endDate,
                          )}
                        </p>

                        <p className="text-xs text-muted">{contractNote(creator)}</p>
                      </>
                    )}
                  </div>
                </td>

                <td role="cell" data-label="Progres konten" className={`${CELL} ${LABELLED}`}>
                  <div className="min-w-0">
                    <p className="whitespace-nowrap max-lg:whitespace-normal">
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
                  </div>
                </td>

                <td role="cell" data-label="Tepat waktu" className={NUMERIC}>
                  {formatPercent(creator.performance.onTimeRate)}
                </td>

                <td role="cell" data-label="Rata-rata revisi" className={NUMERIC}>
                  {formatRevisions(creator.performance.avgRevisions)}
                </td>

                <td role="cell" data-label="Produktivitas" className={`${CELL} ${LABELLED}`}>
                  <Pill tone={PRODUCTIVITY_TONES[creator.performance.productivity]}>
                    {creator.performance.productivityLabel}
                  </Pill>
                </td>

                <td role="cell" className={`${CELL} whitespace-nowrap max-lg:pt-2`}>
                  <Link
                    href={creatorDetailHref(creator.id, opened)}
                    // Every row has one; the creator's name tells them apart when heard.
                    aria-label={`Detail ${creator.name}`}
                    // The row would hear this press too and open the page a second time.
                    onClick={(event) => event.stopPropagation()}
                    // A full-width target on a phone, well above WCAG 2.5.8's 24px.
                    className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 hover:bg-surface-2 active:bg-surface-2 max-lg:flex max-lg:min-h-11 max-lg:w-full max-lg:items-center max-lg:justify-center max-lg:text-[13px]"
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
