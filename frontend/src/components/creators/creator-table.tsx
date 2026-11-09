"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PRODUCTIVITY_TONES } from "./productivity-tones";
import { contractTypePrefix } from "@/lib/creator-form";
import { buttonClasses } from "@/components/ui/button-classes";
import { ConnectionBadge } from "@/components/ui/connection-badge";
import {
  readConnections,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type SocialConnection,
  type SocialPlatform,
} from "@/lib/social-connection";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { useUrlQuery } from "@/lib/url-query";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import { DEFAULT_CREATOR_DETAIL_PARAMS, creatorDetailHref } from "@/lib/creator-detail";
import { ProductivityTip } from "./productivity-tip";
import type { ContractStatus, CreatorSummary } from "@/lib/creators";
import {
  EMPTY,
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
} from "@/lib/format";
import { ScrollFrame } from "@/components/ui/scroll-frame";

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

/** `tip` is the ⓘ beside a heading, in the same words Creator Detail explains it with. */
const COLUMNS: { label: string; numeric?: boolean; tip?: ReactNode }[] = [
  { label: "Creator" },
  { label: "Kontrak" },
  { label: "Progres konten" },
  { label: "Tepat waktu", numeric: true },
  { label: "Rata-rata revisi", numeric: true },
  { label: "Produktivitas", tip: <ProductivityTip /> },
];

const HEAD = "border-b border-rule px-5 pb-2 pt-3 text-left text-xs font-semibold text-muted";

// Below lg a row reads as a card, as Task Saya's rows do: cells stack, the row carries the
// rule, and a value names its column from data-label since the header row is hidden.
const CELL =
  "border-b border-rule-2 px-5 py-3 align-top text-[13px] max-lg:block max-lg:border-0 max-lg:px-0 max-lg:py-1";

const LABELLED =
  "max-lg:flex max-lg:items-start max-lg:gap-2 max-lg:before:w-28 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

const NUMERIC = `${CELL} ${LABELLED} text-right tabular-nums max-lg:text-left`;

function socials(
  creator: CreatorSummary,
): { platform: SocialPlatform; text: string; connection: SocialConnection }[] {
  // Read once per row, not once per platform.
  const connections = readConnections(creator.socialConnections);
  return SOCIAL_PLATFORMS.filter((platform) => creator.socials[platform]).map((platform) => ({
    platform,
    text: `${SOCIAL_PLATFORM_LABELS[platform]} @${creator.socials[platform]}`,
    connection: connections[platform],
  }));
}

function contractNote(creator: CreatorSummary): string {
  const remaining = formatDaysRemaining(creator.contract.daysRemaining);
  const note =
    creator.contract.periodNumber > 1
      ? `${remaining}, periode ke-${creator.contract.periodNumber}`
      : remaining;

  return `${contractTypePrefix(creator.contract.type)}${note}`;
}

const LINK_BUTTON = `inline-flex items-center ${buttonClasses()}`;

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
  const { replaceQuery } = useUrlQuery();
  const opened = returnTo
    ? { ...DEFAULT_CREATOR_DETAIL_PARAMS, back: returnTo }
    : DEFAULT_CREATOR_DETAIL_PARAMS;

  if (creators.length === 0) {
    // The way back from an empty search clears it and every filter, as the bar's Reset does.
    return <EmptyRoster total={total} filtered={filtered} onReset={() => replaceQuery("")} />;
  }

  return (
    <>
      <ScrollFrame>
        {/* Explicit roles: a table whose display changes can lose its semantics in some browsers.
            A <td> keeps none of its own: it is a cell of the explicit row it sits in. */}
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
                  {column.tip === undefined ? (
                    column.label
                  ) : (
                    // End-aligned: the bubble hangs back over the table, not past its scroll edge.
                    <span className="inline-flex items-center gap-1">
                      {column.label}
                      <InfoTip text={column.tip} label={`Tentang ${column.label}`} align="end" />
                    </span>
                  )}
                </th>
              ))}

              <th role="columnheader" scope="col" className={HEAD}>
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>

          <tbody role="rowgroup" className="max-lg:flex max-lg:flex-col max-lg:gap-3 max-lg:bg-paper max-lg:p-3">
            {creators.map((creator) => (
              // A press anywhere on the row opens the creator's page (PBI-4). The name is the
              // same door as a link, for the keyboard and for screen readers.
              <tr
                key={creator.id}
                role="row"
                onClick={() => {
                  // Dragging across a name to copy it ends in a click here: copying, not opening.
                  if (window.getSelection()?.toString()) return;
                  router.push(creatorDetailHref(creator.id, opened));
                }}
                className="cursor-pointer transition-colors hover:bg-surface-2 max-lg:block max-lg:rounded-(--radius-panel) max-lg:border max-lg:border-rule max-lg:bg-surface max-lg:px-4 max-lg:py-3"
              >
                <td className={`${CELL} min-w-52 wrap-anywhere max-lg:min-w-0`}>
                  <p className="text-sm font-semibold text-ink">
                    <Link
                      href={creatorDetailHref(creator.id, opened)}
                      // The row would hear this press too and open the page a second time.
                      onClick={(event) => event.stopPropagation()}
                      className="hover:underline"
                    >
                      {creator.name}
                    </Link>
                  </p>

                  <p className="mt-0.5 text-xs text-muted">{creator.email}</p>

                  {socials(creator).map(({ platform, text, connection }) => (
                    // One line however long the handle: the badge never drops under it.
                    <p key={platform} className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
                      <span>{text}</span>
                      <ConnectionBadge
                        platform={SOCIAL_PLATFORM_LABELS[platform]}
                        connection={connection}
                      />
                    </p>
                  ))}

                  {creator.accessRevokeDate ? (
                    <p className="mt-1 text-xs font-semibold text-red-ink">
                      Akses dicabut {formatDate(creator.accessRevokeDate)}
                    </p>
                  ) : null}
                </td>

                <td data-label="Kontrak" className={`${CELL} ${LABELLED}`}>
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

                <td data-label="Progres konten" className={`${CELL} ${LABELLED}`}>
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

                <td data-label="Tepat waktu" className={NUMERIC}>
                  {formatPercent(creator.performance.onTimeRate)}
                </td>

                <td data-label="Rata-rata revisi" className={NUMERIC}>
                  {formatRevisions(creator.performance.avgRevisions)}
                </td>

                <td data-label="Produktivitas" className={`${CELL} ${LABELLED}`}>
                  <Pill tone={PRODUCTIVITY_TONES[creator.performance.productivity]}>
                    {creator.performance.productivityLabel}
                  </Pill>
                </td>

                <td className={`${CELL} whitespace-nowrap max-lg:pt-2`}>
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
      </ScrollFrame>
    </>
  );
}
