"use client";

import Link from "next/link";
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
import { creatorDetailBase, PRODUCTIVITY_TIP } from "@/lib/creator-detail";
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

/** `tip` is the ⓘ beside a heading, in the same words Creator Detail explains it with. */
const COLUMNS: { label: string; numeric?: boolean; tip?: string }[] = [
  { label: "Creator" },
  { label: "Kontrak" },
  { label: "Progres konten" },
  { label: "Tepat waktu", numeric: true },
  { label: "Rata-rata revisi", numeric: true },
  { label: "Produktivitas", tip: PRODUCTIVITY_TIP },
];

const HEAD = "border-b border-rule px-5 pb-2 pt-3 text-left text-xs font-semibold text-muted";

const CELL = "border-b border-rule-2 px-5 py-3 align-top text-[13px]";

const NUMERIC = `${CELL} text-right tabular-nums`;

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
