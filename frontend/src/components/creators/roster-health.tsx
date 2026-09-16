"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CreatorListResponse, ProductivityFilter } from "@/lib/creators";
import { updateQuery } from "@/lib/query";

/**
 * The roster's health as one shape: a band split into the three productivity groups, sized
 * by share. It answers the admin's first question — how is the roster doing — and each
 * segment is also the productivity filter, so the answer is one click from the detail.
 *
 * Always reflects the whole roster, never the filtered page; a filter changes what is on
 * screen, not how the roster is doing.
 */

const BANDS = [
  { key: "good", label: "Baik", fill: "bg-green", text: "text-green" },
  { key: "watch", label: "Perlu perhatian", fill: "bg-amber", text: "text-amber" },
  { key: "risk", label: "Berisiko", fill: "bg-red", text: "text-red" },
] as const;

type Band = (typeof BANDS)[number]["key"];

function counts(stats: CreatorListResponse["stats"]): Record<Band, number> {
  return {
    good: stats.good,
    // Everyone not in the other two bands, including creators with nothing to judge yet.
    watch: Math.max(0, stats.total - stats.good - stats.risk),
    risk: stats.risk,
  };
}

function share(part: number, whole: number): string {
  if (whole === 0) return "0%";
  return `${((part / whole) * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function RosterHealth({
  stats,
  productivity,
}: {
  stats: CreatorListResponse["stats"];
  productivity: ProductivityFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const byBand = counts(stats);

  const choose = (band: Band) => {
    const next = productivity === band ? "" : band;
    const query = updateQuery(searchParams.toString(), { productivity: next });
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const summary = BANDS.map((band) => `${byBand[band.key]} ${band.label.toLowerCase()}`).join(", ");

  return (
    <section className="mb-6 rounded-[var(--radius-panel)] border border-line bg-surface px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-[26px] font-bold leading-none tracking-tight">{stats.total} creator</p>
        <p className="text-[13px] text-muted">{stats.active} dengan kontrak aktif</p>
      </div>

      <div
        role="img"
        aria-label={`Produktivitas roster: ${summary}`}
        className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-low"
      >
        {BANDS.map((band) => (
          <span
            key={band.key}
            data-band={band.key}
            className={`h-full ${band.fill} transition-[width] ${
              productivity !== "all" && productivity !== band.key ? "opacity-30" : ""
            }`}
            style={{ width: share(byBand[band.key], stats.total) }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {BANDS.map((band) => {
          const pressed = productivity === band.key;
          return (
            <button
              key={band.key}
              type="button"
              aria-pressed={pressed}
              aria-label={`${band.label}, ${byBand[band.key]} creator`}
              onClick={() => choose(band.key)}
              className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-2 py-1 text-[13px] transition-colors ${
                pressed
                  ? "border-line-strong bg-surface-low"
                  : "border-transparent hover:bg-surface-low"
              }`}
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${band.fill}`} />
              <span className="font-semibold">{byBand[band.key]}</span>
              <span className={pressed ? band.text : "text-ink-soft"}>{band.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
