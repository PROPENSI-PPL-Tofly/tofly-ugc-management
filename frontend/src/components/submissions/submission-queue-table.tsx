import { formatDate } from "@/lib/format";
import type { SubmissionQueueItem } from "@/lib/submissions";

const STATUS_LABELS: Record<string, string> = {
  draft_review: "Draft Menunggu Review",
  draft_revised: "Draft Revised",
};

export function SubmissionQueueTable({
  items,
}: {
  items: SubmissionQueueItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-[15px] font-semibold text-muted">
          Tidak ada draft untuk direview.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th className="px-5 py-3 font-semibold">Nama Kreator</th>
            <th className="px-5 py-3 font-semibold">Nama Konten</th>
            <th className="px-5 py-3 font-semibold">Tipe</th>
            <th className="px-5 py-3 font-semibold">Deadline</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.submissionId} className="border-b border-rule">
              <td className="px-5 py-3">{row.creatorName}</td>
              <td className="px-5 py-3">{row.contentName}</td>
              <td className="px-5 py-3">{row.type}</td>
              <td className="px-5 py-3 whitespace-nowrap">{formatDate(row.deadline)}</td>
              <td className="px-5 py-3">{STATUS_LABELS[row.status] ?? row.status}</td>
              <td className="px-5 py-3">
                <button
                  type="button"
                  className="cursor-pointer rounded-(--radius-control) border border-rule bg-surface px-2 py-1 text-xs font-semibold text-ink hover:border-ink-2"
                >
                  Lihat Detail
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
