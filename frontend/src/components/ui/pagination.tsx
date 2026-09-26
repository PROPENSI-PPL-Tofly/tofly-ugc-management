"use client";

import Link, { useLinkStatus } from "next/link";

const CONTROL =
  "inline-flex min-h-9 items-center rounded-(--radius-control) border px-3 text-xs font-semibold transition-colors";
const ENABLED = `${CONTROL} border-rule bg-surface text-ink hover:border-ink-2 active:bg-surface-2`;
const DISABLED = `${CONTROL} cursor-not-allowed border-rule-2 text-muted opacity-60`;

/** Dims the label while the next page is on its way, so a slow backend is not a dead click. */
function PendingLabel({ children }: { children: string }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-busy={pending} data-pending={pending} className="data-[pending=true]:opacity-50">
      {children}
    </span>
  );
}

/** The list's own URL for a page: its filters first, page 1 without a page parameter. */
function pageHref(basePath: string, query: Record<string, string>, page: number): string {
  const params = new URLSearchParams(query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function PageLink({ href, children }: { href: string | null; children: string }) {
  if (href === null) {
    return (
      <span aria-disabled="true" className={DISABLED}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={ENABLED}>
      <PendingLabel>{children}</PendingLabel>
    </Link>
  );
}

/**
 * Previous / next as plain links: the page number lives in the URL, so a page can be
 * bookmarked, shared, and reloaded. Nothing to steer when everything fits on one page.
 */
export function Pagination({
  basePath,
  noun,
  query = {},
  page,
  pageSize,
  total,
  totalPages,
}: {
  /** The list this pagination belongs to, e.g. "/admin/submissions". */
  basePath: string;
  /** What the list counts, e.g. "creator" or "draft". */
  noun: string;
  /** Active filters, carried into every page link so paging never drops them. */
  query?: Record<string, string>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <p className="text-xs text-muted tabular-nums">
        Menampilkan {first}–{last} dari {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        <span className="mr-1 whitespace-nowrap text-xs text-muted tabular-nums">
          Halaman {page} dari {totalPages}
        </span>
        <PageLink href={page > 1 ? pageHref(basePath, query, page - 1) : null}>Sebelumnya</PageLink>
        <PageLink href={page < totalPages ? pageHref(basePath, query, page + 1) : null}>
          Berikutnya
        </PageLink>
      </div>
    </div>
  );
}
