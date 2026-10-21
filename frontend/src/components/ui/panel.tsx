import type { ReactNode } from "react";
import type { PlaceIconName } from "@/components/shell/place-icon";

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

/** Stub until the bands land: accepts the band's parts, draws nothing yet. */
export function PanelBand(
  _props: Readonly<{
    title: string;
    tone: BandTone;
    icon: PlaceIconName;
    count?: number;
    noun?: string;
    aside?: ReactNode;
    action?: ReactNode;
    hint?: string;
  }>,
) {
  return null;
}
