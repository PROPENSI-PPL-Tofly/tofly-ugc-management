import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClasses } from "@/components/ui/button-classes";
import { StatusDot } from "@/components/ui/pill";
import { Panel, PanelHead } from "@/components/ui/panel";
import { fetchSubmissionQueue } from "@/lib/submissions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Content Plan (All) — Tofly",
};

interface DraftCounts {
  waiting: number;
  resubmitted: number;
}

/** Both counts come from the review queue itself, so they match what the queue will list. */
async function loadDraftCounts(): Promise<DraftCounts | null> {
  try {
    const [all, resubmitted] = await Promise.all([
      fetchSubmissionQueue(1, {}),
      fetchSubmissionQueue(1, { status: "draft_revised" }),
    ]);
    return { waiting: all.total, resubmitted: resubmitted.total };
  } catch {
    return null;
  }
}

function DraftQueueSummary({ counts }: { counts: DraftCounts | null }) {
  if (counts === null) {
    return <p className="text-[13px] text-muted">Jumlah draft belum bisa dimuat.</p>;
  }

  if (counts.waiting === 0) {
    return <p className="text-[13px] text-muted">Tidak ada draft yang menunggu review</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <p className="font-semibold tabular-nums">{counts.waiting} draft menunggu review</p>
      {counts.resubmitted > 0 ? (
        // Resubmitted drafts are the most time-sensitive decisions, so they get their own way in.
        <Link
          href="/admin/submissions?status=draft_revised"
          className="rounded-(--radius-control) text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          <StatusDot tone="amber">{counts.resubmitted} dikirim ulang</StatusDot>
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The Content Plan (All) tab. For now it carries the entry into the draft review queue; the
 * cross-creator table and calendar of every content item will join it here.
 */
export default async function ContentPlanAllPage() {
  const counts = await loadDraftCounts();

  return (
    <AppShell
      title="Content Plan (All)"
      subtitle="Jadwal konten semua creator dan hal yang menunggu keputusan admin"
    >
      <Panel>
        <PanelHead title="Perlu keputusan" />
        <section
          aria-labelledby="draft-queue-title"
          className="flex flex-wrap items-center justify-between gap-4 border-t border-rule px-5 py-4"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h3 id="draft-queue-title" className="text-[14px] font-semibold">
              Antrian Draft
            </h3>
            <p className="text-[12.5px] text-muted">
              Draft dari creator yang menunggu Approve atau Minta Revisi.
            </p>
            <DraftQueueSummary counts={counts} />
          </div>
          {/* Opening the queue is this page's primary action, so it takes the accent look. */}
          <Link href="/admin/submissions" className={`inline-block ${buttonClasses("accent")}`}>
            Buka Antrian Draft
          </Link>
        </section>
      </Panel>
    </AppShell>
  );
}
