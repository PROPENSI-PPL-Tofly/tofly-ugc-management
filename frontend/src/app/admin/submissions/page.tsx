import { AppShell } from "@/components/shell/app-shell";
import { Panel, PanelHead } from "@/components/ui/panel";
import { SubmissionQueueTable } from "@/components/submissions/submission-queue-table";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { LoadError } from "@/components/ui/load-error";
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

  const query = filterQuery(filters);
  const retryParams = new URLSearchParams(query);
  if (page > 1) retryParams.set("page", String(page));
  const retryHref =
    retryParams.size > 0 ? `/admin/submissions?${retryParams}` : "/admin/submissions";

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
          status={filters.status}
          type={filters.type}
          overdue={filters.overdue}
        />
        {result ? (
          <>
            <SubmissionQueueTable
              items={result.items}
              filtered={Object.keys(query).length > 0}
            />
            <Pagination
              basePath="/admin/submissions"
              noun="draft"
              query={query}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </>
        ) : (
          <LoadError title="Antrian tidak bisa dimuat." retryHref={retryHref} />
        )}
      </Panel>
    </AppShell>
  );
}
