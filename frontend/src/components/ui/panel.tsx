import type { ReactNode } from "react";
import { PlaceIcon, type PlaceIconName } from "@/components/shell/place-icon";

/**
 * The bordered surface a section of the admin interface sits on. One containment layer.
 *
 * It clips its content to its rounded corners. A panel that holds a popup (a filter's
 * dropdown) passes `clip={false}`, or the popup is cut off wherever the panel ends.
 */
export function Panel({ children, clip = true }: { children: ReactNode; clip?: boolean }) {
  return (
    <section
      className={`${clip ? "overflow-hidden " : ""}rounded-(--radius-panel) border border-rule bg-surface shadow-whisper`}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div>
        <h2 className="text-[15px]">{title}</h2>
        {hint ? <p className="mt-1 max-w-[64ch] text-[12.5px] text-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A list panel's title band, tinted by tone: the creator's accent, the admin's ink, or quiet. */
export type BandTone = "accent" | "ink" | "quiet";

// Strategy table: each tone is the band's tint and its count's fill, nothing else changes.
const BAND_TONES: Record<BandTone, { band: string; count: string; aside: string }> = {
  accent: {
    band: "border-accent/35 bg-accent-wash text-accent-deep",
    count: "bg-accent text-accent-ink",
    aside: "border-accent/35",
  },
  ink: { band: "border-ink/20 bg-surface-2 text-ink", count: "bg-ink text-accent-ink", aside: "border-ink/20" },
  quiet: { band: "border-rule bg-surface-2 text-ink-2", count: "bg-ink-2 text-accent-ink", aside: "border-rule" },
};

/**
 * A list panel's title, as the approved screens draw it: a tinted band with a decorative icon,
 * the list's name, and how many it holds (read as "12 creator", not a bare number). The aside
 * is for a phone only, where the tabs fold into Filter and the band names the open one. A hint
 * stays under the band, so no explanation is lost to the new title.
 */
export function PanelBand({
  title,
  tone,
  icon,
  count,
  noun,
  aside,
  action,
  hint,
}: Readonly<{
  title: string;
  tone: BandTone;
  /** Left out where the design titles a box by its name alone (Pembayaran). */
  icon?: PlaceIconName;
  count?: number;
  noun?: string;
  aside?: ReactNode;
  action?: ReactNode;
  hint?: string;
}>) {
  const theme = BAND_TONES[tone];

  return (
    <>
      <div
        data-tone={tone}
        // Rounded itself, so a panel left unclipped for its popups still shows round corners.
        className={`flex flex-wrap items-center gap-2 rounded-t-[calc(var(--radius-panel)-1.5px)] border-b-[1.5px] px-5 py-3 max-sm:px-4 ${theme.band}`}
      >
        {icon ? <PlaceIcon name={icon} className="size-[18px] shrink-0" /> : null}
        <h2 className="text-base font-extrabold">{title}</h2>
        {count === undefined ? null : (
          <span
            data-count
            className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12.5px] font-extrabold tabular-nums ${theme.count}`}
          >
            {count}
            {noun ? <span className="sr-only"> {noun}</span> : null}
          </span>
        )}
        {aside ? (
          <span
            className={`ml-auto rounded-full border bg-surface px-2 py-0.5 text-xs font-bold sm:hidden ${theme.aside}`}
          >
            {aside}
          </span>
        ) : null}
        {action ? <div className={`shrink-0 ${aside ? "" : "ml-auto"}`}>{action}</div> : null}
      </div>
      {hint ? <p className="max-w-[64ch] px-5 pt-3 text-[12.5px] text-muted max-sm:px-4">{hint}</p> : null}
    </>
  );
}
