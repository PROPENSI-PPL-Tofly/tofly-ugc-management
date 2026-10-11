"use client";

import { CONTENT_PLAN_TABS, type ContentPlanCounts, type ContentPlanTab } from "@/lib/content-plan";

const TAB =
  "cursor-pointer rounded-t-(--radius-control) border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-ink";

const TAB_ON = `${TAB} border-accent text-accent-deep`;

const COUNT_RED = "ml-2 rounded-full bg-red px-2 py-0.5 text-[11px] font-semibold text-accent-ink";
const COUNT_GREY =
  "ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2";

/**
 * The four tabs of the Content Plan, grouped by whose ball it is. Only Perlu Approval's
 * counter turns red, and only past zero — a red badge on an empty queue would cry wolf.
 */
export function ContentPlanTabs({
  active,
  counts,
  onSelect,
}: Readonly<{
  active: ContentPlanTab;
  counts: ContentPlanCounts;
  onSelect: (tab: ContentPlanTab) => void;
}>) {
  return (
    <div role="tablist" aria-label="Tab Content Plan" className="flex flex-wrap gap-1 border-b border-rule px-5">
      {CONTENT_PLAN_TABS.map((def) => {
        const count = counts[def.key];
        // The urgent tab shows its count only when there is one; a counting tab always does.
        const showCount = def.urgent ? count > 0 : def.counter;

        return (
          <button
            key={def.key}
            type="button"
            role="tab"
            aria-selected={active === def.key}
            onClick={() => onSelect(def.key)}
            className={active === def.key ? TAB_ON : TAB}
          >
            {def.label}
            {showCount ? (
              <span
                data-testid={`count-${def.key}`}
                className={def.urgent ? COUNT_RED : COUNT_GREY}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
