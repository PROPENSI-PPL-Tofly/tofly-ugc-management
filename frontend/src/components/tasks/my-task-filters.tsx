"use client";

import { usePathname, useRouter } from "next/navigation";
import { TASK_STATUS_FILTERS, taskStatusLabel, type TaskStatusFilter } from "@/lib/my-tasks";

const FIELD =
  "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2";

/**
 * Task Saya's status filter. The URL is its only state, like the admin lists: picking a status
 * replaces the query and drops the page, since the old page may not exist under the new filter.
 */
export function MyTaskFilters({ status }: Readonly<{ status: TaskStatusFilter | null }>) {
  const router = useRouter();
  const pathname = usePathname();

  function pick(value: string) {
    const next = value ? `${pathname}?${new URLSearchParams({ status: value })}` : pathname;
    router.replace(next, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-muted">Status</span>
        <select
          name="status"
          aria-label="Status"
          value={status ?? ""}
          onChange={(event) => pick(event.target.value)}
          className={FIELD}
        >
          <option value="">Semua</option>
          {TASK_STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {taskStatusLabel(value)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
