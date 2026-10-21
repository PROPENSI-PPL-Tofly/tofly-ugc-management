import Link from "next/link";
import { useId } from "react";
import { StatusDot } from "@/components/ui/pill";
import { CONTENT_STATUS_TONES, CONTENT_TYPE_LABELS } from "@/lib/content-labels";
import {
  UPCOMING_DAYS,
  deadlineListHref,
  overdueParams,
  taskDetailHref,
  upcomingParams,
  type DeadlineList,
} from "@/lib/creator-dashboard";
import { formatDate, formatDue } from "@/lib/format";
import { taskStatusLabel } from "@/lib/my-tasks";

const SECTION = "overflow-hidden rounded-(--radius-panel) border border-rule bg-surface shadow-whisper";

const COUNT_GREY = "ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2";
const COUNT_RED = "ml-2 rounded-full bg-red px-2 py-0.5 text-[11px] font-semibold text-accent-ink";

/** One list of deadlines: its heading counts the whole list, its rows lead to each task. */
function DeadlineSection({
  title,
  list,
  allHref,
  late,
  now,
  empty,
}: Readonly<{
  title: string;
  list: DeadlineList;
  /** Task Saya under the same filters, for the rows this section leaves out. */
  allHref: string;
  /** Overdue work: its count is red and its days read as how late it is. */
  late: boolean;
  now: Date;
  empty: string;
}>) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={SECTION}>
      <h2 id={headingId} className="flex items-center px-5 pb-3 pt-4 text-[15px]">
        {title}
        <span className={late ? COUNT_RED : COUNT_GREY}>{list.total}</span>
      </h2>

      {list.items.length === 0 ? (
        <p className="border-t border-rule-2 px-5 py-4 text-[13px] text-muted">{empty}</p>
      ) : (
        <ul>
          {list.items.map((task) => (
            <li key={task.id} className="border-t border-rule-2">
              {/* The whole row is one target, at least 44px tall on a phone. */}
              <Link
                href={taskDetailHref(task.id)}
                className="flex min-h-11 items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink wrap-anywhere">{task.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {CONTENT_TYPE_LABELS[task.type]} · {formatDate(task.deadline)}
                  </p>
                  <p className="mt-1.5 text-xs">
                    <StatusDot tone={CONTENT_STATUS_TONES[task.status]}>
                      {taskStatusLabel(task.status)}
                    </StatusDot>
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[13px] font-semibold tabular-nums ${late ? "text-red-ink" : "text-ink"}`}
                >
                  {formatDue(task.deadline, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.total > list.items.length ? (
        <Link
          href={allHref}
          className="flex min-h-11 items-center border-t border-rule-2 px-5 text-[13px] font-semibold text-accent-deep hover:bg-surface-2"
        >
          Lihat semua {list.total} di Task Saya
        </Link>
      ) : null}
    </section>
  );
}

/**
 * What to work on next, under the dashboard's cards: overdue work first, and only while there
 * is some, then every deadline in the next UPCOMING_DAYS days. Both lists come narrowed from the
 * API, so their counts are true across every page. It only draws what it is handed.
 */
export function DeadlineAgenda({
  overdue,
  upcoming,
  today,
  now,
}: Readonly<{
  overdue: DeadlineList;
  upcoming: DeadlineList;
  /** Today in Jakarta, "YYYY-MM-DD", which the upcoming list was read from. */
  today: string;
  now: Date;
}>) {
  return (
    <div className="flex flex-col gap-3.5">
      {overdue.total > 0 ? (
        <DeadlineSection
          title="Overdue"
          list={overdue}
          allHref={deadlineListHref(overdueParams())}
          late
          now={now}
          empty=""
        />
      ) : null}

      <DeadlineSection
        title={`Deadline ${UPCOMING_DAYS} hari ke depan`}
        list={upcoming}
        allHref={deadlineListHref(upcomingParams(today))}
        late={false}
        now={now}
        empty={`Tidak ada deadline dalam ${UPCOMING_DAYS} hari ke depan.`}
      />
    </div>
  );
}
