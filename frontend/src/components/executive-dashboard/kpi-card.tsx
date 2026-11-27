import { InfoTip } from "@/components/ui/info-tip";
import { buttonClasses } from "@/components/ui/button-classes";
import type { KpiReading } from "@/lib/executive-kpis";
import {
  describeTrend,
  type Direction,
  type KpiStrategy,
  type Tone,
  type Trend,
} from "@/lib/executive-kpi-strategies";
import { EMPTY } from "@/lib/format";
import { isSameSitePath } from "@/lib/safe-href";

// The approved design's KPI card (Tofly Sprint 4 Prototype, PBI-24): a firm 1.5px edge, a small
// label over a large figure, then the comparison and, for one KPI, a note.
export const CARD =
  "h-full rounded-(--radius-panel) border-[1.5px] border-rule bg-surface px-[18px] py-4 shadow-whisper";
export const LABEL =
  "mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-2";
const VALUE =
  "text-[26px] leading-[1.15] font-extrabold tabular-nums max-[560px]:text-[20px]";

const GLYPH: Record<Direction, string> = { up: "▲", down: "▼", flat: "■" };
const TONE_COLOUR: Record<Tone, string> = {
  good: "text-green-ink",
  bad: "text-red-ink",
  flat: "text-ink-2",
};
// The shape and the colour are hidden from a screen reader or lost on some eyes, so the move and
// whether it is good news are also said in words (WCAG 1.4.1).
const MOVE: Record<Direction, string> = {
  up: "naik",
  down: "turun",
  flat: "tetap",
};
const VERDICT: Record<Tone, string | null> = {
  good: "lebih baik",
  bad: "lebih buruk",
  flat: null,
};

function TrendLine({
  trend,
  months,
}: Readonly<{ trend: Trend; months: number }>) {
  if (trend.kind === "none") return null;

  if (trend.kind === "fromZero") {
    return (
      <p data-trend className="mt-1.5 text-xs">
        <span className={`font-bold ${TONE_COLOUR.flat}`}>
          <span aria-hidden="true">{GLYPH[trend.direction]}</span>
          <span className="sr-only">{MOVE[trend.direction]}</span>
        </span>{" "}
        <span className="text-muted">sebelumnya {trend.previousText}</span>
      </p>
    );
  }

  const verdict = VERDICT[trend.tone];
  return (
    <p data-trend className="mt-1.5 text-xs">
      <span className={`font-bold ${TONE_COLOUR[trend.tone]}`}>
        <span aria-hidden="true">{GLYPH[trend.direction]}</span>
        <span className="sr-only">{MOVE[trend.direction]}</span> {trend.text}
        {verdict ? <span className="sr-only">, {verdict}</span> : null}
      </span>{" "}
      <span className="text-muted">vs {months} bulan sebelumnya</span>
    </p>
  );
}

/**
 * One of the Executive Dashboard's six KPI cards (PBI-24.2). Everything that differs between
 * KPIs comes from its strategy, so this one component draws all six. A failed value shows only
 * this card's error (AC 13), never a figure, so one bad KPI hides neither the other cards nor
 * the charts.
 */
export function KpiCard({
  strategy,
  reading,
  note,
  months,
  retryHref,
}: Readonly<{
  strategy: KpiStrategy;
  reading: KpiReading;
  /** The line under the comparison, if the KPI has one. */
  note: string | null;
  /** The chosen range's length, which the previous range matches. */
  months: number;
  /** The same view again, for Coba lagi. */
  retryHref: string;
}>) {
  if (reading.status === "failed") {
    return (
      <div className={CARD}>
        <p className={LABEL}>{strategy.label}</p>
        <p className="mt-1 text-[12.5px] text-red-ink">Gagal dimuat.</p>
        {isSameSitePath(retryHref) ? (
          <div className="mt-1.5">
            <a
              href={retryHref}
              className={`inline-flex items-center ${buttonClasses("default", "sm")}`}
            >
              Coba lagi
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  const { current } = reading;
  return (
    <div className={CARD}>
      <p className={LABEL}>
        <span>{strategy.label}</span>
        <InfoTip
          text={strategy.tip(current)}
          label={`Rumus ${strategy.label}`}
        />
      </p>
      <p className={VALUE}>
        {current === null ? EMPTY : strategy.format(current)}
      </p>
      <TrendLine trend={describeTrend(strategy, reading)} months={months} />
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
