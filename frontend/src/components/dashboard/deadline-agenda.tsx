import Link from "next/link";
import { useId } from "react";
import { PagedList } from "@/components/ui/pager";
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

// Each list is its own box with its title in a band above the rows, so the eye lands on the
// title first: red for what is late, blue for what is due next (the approved design).
const TONES = {
  late: {
    section: "border-red/35",
    band: "border-red/35 bg-red-wash text-red-ink",
    count: "bg-red text-accent-ink",
  },
  next: {
    section: "border-accent/35",
    band: "border-accent/35 bg-accent-wash text-accent-deep",
    count: "bg-accent text-accent-ink",
  },
} as const;

/** A clock for what is late, a calendar for what is due next; decoration beside the title. */
function BandIcon({ late }: Readonly<{ late: boolean }>) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px] shrink-0">
      {late ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </>
      )}
    </svg>
  );
}

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
  const tone = TONES[late ? "late" : "next"];

  const rows = list.items.map((task) => (
    <li key={task.id} className="border-t border-rule-2 first:border-t-0">
      {/* The whole row is one target, at least 44px tall on a phone. */}
      <Link
        href={taskDetailHref(task.id)}
        className="flex min-h-11 items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-2 active:bg-rule-2"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink wrap-anywhere">{task.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {CONTENT_TYPE_LABELS[task.type]} · {formatDate(task.deadline)}
          </p>
          <p className="mt-1.5 text-xs">
            <StatusDot tone={CONTENT_STATUS_TONES[task.status]}>{taskStatusLabel(task.status)}</StatusDot>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-bold tabular-nums ${late ? "bg-red-wash text-red-ink" : "bg-surface-2 text-ink"}`}
        >
          {formatDue(task.deadline, now)}
        </span>
      </Link>
    </li>
  ));

  return (
    <section
      aria-labelledby={headingId}
      className={`overflow-hidden rounded-(--radius-panel) border-[1.5px] bg-surface shadow-whisper ${tone.section}`}
    >
      <div data-band={late ? "late" : "next"} className={`flex items-center gap-2 border-b-[1.5px] px-4 py-3 ${tone.band}`}>
        <BandIcon late={late} />
        <h2 id={headingId} className="flex items-center text-base font-extrabold">
          {title}
          <span className={`ml-2 grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12.5px] font-extrabold ${tone.count}`}>
            {list.total}
          </span>
        </h2>
      </div>

      {list.items.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted">{empty}</p>
      ) : late ? (
        // Late work pages in place: one task at a time on a phone, three on a wide screen.
        <PagedList label="Halaman task overdue" noun="Task overdue" phone={1} wide={3}>
          {rows}
        </PagedList>
      ) : (
        <ul>{rows}</ul>
      )}

      {list.total > list.items.length ? (
        <Link
          href={allHref}
          className="flex min-h-11 items-center justify-center border-t border-rule-2 px-5 text-[13px] font-bold text-accent-deep transition-colors hover:bg-surface-2 active:bg-rule-2"
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
