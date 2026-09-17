import { StatusDot } from "@/components/ui/pill";
import { formatDate } from "@/lib/format";
import { formatDeadlineDistance, type MyTask, STATUS_LABELS, STATUS_TONES, TYPE_LABELS } from "@/lib/tasks";

/** The read-only "Content info" block both submit dialogs open with. */
export function ContentInfo({ task }: { task: MyTask }) {
  return (
    <section aria-label="Info konten" className="rounded-[var(--radius-control)] bg-surface-low px-4 py-3.5">
      <p className="text-sm font-semibold text-ink">{task.name}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted">Tipe</dt>
          <dd>{TYPE_LABELS[task.type]}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted">Deadline</dt>
          <dd>
            {formatDate(task.deadline)}{" "}
            <span className="text-muted">({formatDeadlineDistance(task.daysUntilDeadline)})</span>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted">Status</dt>
          <dd>
            <StatusDot tone={STATUS_TONES[task.status]}>{STATUS_LABELS[task.status]}</StatusDot>
          </dd>
        </div>
      </dl>
      {task.brief ? (
        <div className="mt-3 text-[13px]">
          <p className="text-muted">Brief</p>
          <p className="mt-0.5 whitespace-pre-line">{task.brief}</p>
        </div>
      ) : null}
    </section>
  );
}
