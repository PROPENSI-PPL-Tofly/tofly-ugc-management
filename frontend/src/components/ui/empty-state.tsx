import type { ReactNode } from "react";

/**
 * What a list shows when it has nothing to show: what is missing, why, and (when there is one)
 * the way forward. Callers pick the wording, so "nothing yet" and "nothing matches" stay apart.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-muted">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
