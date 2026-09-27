import { DetailField } from "@/components/ui/detail-field";
import { EMPTY, formatDate } from "@/lib/format";

/** The task a Task Saya modal acts on, as the list row hands it over. */
export interface TaskContent {
  /** The id the draft and video endpoints take. */
  id: string;
  name: string;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  brief?: string;
  /** What the admin asked to change; only a row awaiting a resubmit has them. */
  revisionNotes?: string | null;
}

/**
 * The read-only part both hand-in modals open with: what the task is, when it is due, the brief
 * to work from and, on a resubmit, what the admin asked to change.
 */
export function TaskSummary({ content }: Readonly<{ content: Omit<TaskContent, "id"> }>) {
  const brief = content.brief?.trim();
  const revisionNotes = content.revisionNotes?.trim();

  return (
    <div className="flex flex-col gap-3 border-b border-rule pb-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailField label="Nama Konten">
          <p className="wrap-anywhere">{content.name}</p>
        </DetailField>
        <DetailField label="Deadline">
          <p>{formatDate(content.deadline)}</p>
        </DetailField>
      </div>
      <DetailField label="Brief">
        <p className="whitespace-pre-line wrap-anywhere text-ink-2">{brief || EMPTY}</p>
      </DetailField>
      {revisionNotes ? (
        <div className="rounded-(--radius-control) border border-amber-wash bg-amber-wash px-3 py-2">
          <DetailField label="Catatan Revisi dari Admin">
            <p className="whitespace-pre-line wrap-anywhere text-amber-ink">{revisionNotes}</p>
          </DetailField>
        </div>
      ) : null}
    </div>
  );
}
