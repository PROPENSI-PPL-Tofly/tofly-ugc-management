import { AppShell } from "@/components/shell/app-shell";
import { Panel, PanelHead } from "@/components/ui/panel";
import { SubmissionQueueTable } from "@/components/submissions/submission-queue-table";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { Pagination } from "@/components/ui/pagination";
import {
  fetchSubmissionQueue,
  parseSubmissionPage,
  type SubmissionQueueFilters,
  type SubmissionQueueResponse,
} from "@/lib/submissions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Antrian Draft — Tofly",
};

/** The filters as they appear in the URL, defaults left out, so page links keep them. */
function filterQuery(filters: SubmissionQueueFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.q) query.q = filters.q;
  if (filters.status && filters.status !== "all") query.status = filters.status;
  if (filters.type && filters.type !== "all") query.type = filters.type;
  if (filters.overdue) query.overdue = "true";
  return query;
}

function LoadFailed() {
  return (
    <div role="alert" className="px-5 py-14 text-center">
      <p className="text-[15px] font-semibold">Antrian tidak bisa dimuat.</p>
      <p className="mt-1 text-[13px] text-muted">Server tidak menjawab.</p>
      <a
        href="/admin/submissions"
        className="mt-4 inline-block rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 active:bg-surface-2"
      >
        Muat ulang
      </a>
    </div>
  );
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { page, invalid } = parseSubmissionPage(params);

  const filters = {
    q: typeof params.q === "string" ? params.q : undefined,
    status:
      params.status === "draft_review" || params.status === "draft_revised"
        ? params.status
        : "all",
    type:
      params.type === "evergreen" || params.type === "specific"
        ? params.type
        : "all",
    overdue: params.overdue === "true",
  } satisfies SubmissionQueueFilters;

  let result: SubmissionQueueResponse | null = null;
  // A page past the end (an old link, or a queue that shrank as drafts were decided) shows
  // the first page instead of an empty table that would claim there is nothing to review.
  let pastEnd: number | null = null;
  try {
    result = await fetchSubmissionQueue(page, filters);
    if (result.total > 0 && result.page > result.totalPages) {
      pastEnd = result.page;
      result = await fetchSubmissionQueue(1, filters);
    }
  } catch {
    result = null;
  }

  return (
    <AppShell
      title="Antrian Draft"
      subtitle="Draft yang menunggu keputusan admin, diurutkan berdasarkan urgensi"
    >
      {invalid !== null ? (
        <p
          role="status"
          className="mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink"
        >
          Halaman &#8220;{invalid}&#8221; tidak dikenal, menampilkan halaman pertama.
        </p>
      ) : null}

      {pastEnd !== null ? (
        <p
          role="status"
          className="mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink"
        >
          Halaman {pastEnd} tidak ada, menampilkan halaman pertama.
        </p>
      ) : null}

      <Panel>
        <PanelHead title="Semua draft menunggu review" />
        <SubmissionFilters
          q={filters.q ?? ""}
          status={filters.status}
          type={filters.type}
          overdue={filters.overdue}
        />
        {result ? (
          <>
            <SubmissionQueueTable items={result.items} />
            <Pagination
              basePath="/admin/submissions"
              noun="draft"
              query={filterQuery(filters)}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </>
        ) : (
          <LoadFailed />
        )}
      </Panel>
    </AppShell>
  );
}
