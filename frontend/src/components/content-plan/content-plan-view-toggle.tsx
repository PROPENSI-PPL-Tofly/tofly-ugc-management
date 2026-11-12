import Link from "next/link";
import { PHONE_TARGET } from "@/components/ui/touch-target";
import {
  CONTENT_PLAN_VIEWS,
  contentPlanViewHref,
  type ContentPlanParams,
} from "@/lib/content-plan";

// The same segmented control Task Saya draws: two halves in one rounded frame, the view being
// shown filled in brand blue.
const FRAME =
  "inline-flex overflow-hidden rounded-(--radius-control) border border-rule";
const HALF = `flex items-center px-3 py-1.5 text-[12.5px] font-semibold ${PHONE_TARGET}`;
const ON = "bg-accent text-accent-ink";
const OFF = "bg-surface text-ink-2 hover:bg-surface-2";

/**
 * Content Plan's Tabel / Kalender switch (I3.6). Links, not buttons: the view lives in the
 * address like the rest of the plan's state, so the calendar can be bookmarked and the
 * browser's Back returns to the table.
 */
export function ContentPlanViewToggle({
  state,
}: Readonly<{
  /** The view, tab, search and filters in effect; all but the page carry to the other view. */
  state: ContentPlanParams;
}>) {
  return (
    <div role="group" aria-label="Tampilan Content Plan" className={FRAME}>
      {CONTENT_PLAN_VIEWS.map(({ key, label }) => (
        <Link
          key={key}
          href={contentPlanViewHref(key, state)}
          aria-current={key === state.view ? "page" : undefined}
          className={`${HALF} ${key === state.view ? ON : OFF}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
