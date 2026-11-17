import { ConnectedAccountsPanel } from "@/components/performance/connected-accounts-panel";
import { ConnectPrompt } from "@/components/performance/connect-prompt";
import { LinkPerformanceTable } from "@/components/performance/link-performance-table";
import { PerformanceFilters } from "@/components/performance/performance-filters";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClasses } from "@/components/ui/button-classes";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import {
  ConnectedAccountsError,
  PERFORMANCE_PATH,
  readConnectOutcome,
  type ConnectedAccount,
} from "@/lib/connected-accounts";
import { fetchMyConnectedAccounts } from "@/lib/connected-accounts.server";
import {
  buildPerformanceLinksQuery,
  parsePerformanceLinksParams,
  type PerformanceLinksPage,
  type PerformanceLinksState,
} from "@/lib/performance-links";
import { MY_TASKS_BASE } from "@/lib/my-tasks";
import { fetchMyPerformanceLinks } from "@/lib/performance-links.server";

export const dynamic = "force-dynamic";

const LINKS_TITLE_ID = "performance-links-title";

export const metadata = {
  title: "Performa Konten — Tofly",
};

type Loaded = { kind: "ok"; accounts: ConnectedAccount[] } | { kind: "signed_out" } | { kind: "failed" };

type Links = { kind: "ok"; page: PerformanceLinksPage } | { kind: "failed" };

async function load(): Promise<Loaded> {
  try {
    return { kind: "ok", accounts: await fetchMyConnectedAccounts() };
  } catch (error) {
    return error instanceof ConnectedAccountsError && error.status === 401
      ? { kind: "signed_out" }
      : { kind: "failed" };
  }
}

/** The link list fails for itself: one section's failure never costs the other (AC 20). */
async function loadLinks(state: PerformanceLinksState): Promise<Links> {
  try {
    return { kind: "ok", page: await fetchMyPerformanceLinks(state) };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * The creator's Performa page (PBI-19, subtask 19.4), where a creator connects their Instagram
 * and TikTok accounts and where every connect lands back. The content performance list below
 * the panel is PBI-27 (27.6): the creator's own links, read-only — no sync and no manual input
 * (AC 20). A failed load says so with a way to try again, never an empty panel that would claim
 * nothing is connected.
 */
export default async function CreatorPerformancePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  // The accounts and the link list load together and fail for themselves.
  const accounts = load();
  const params = await searchParams;
  const state = parsePerformanceLinksParams(params);
  const [loaded, links] = await Promise.all([accounts, loadLinks(state)]);
  const isFiltered = state.platform.length > 0 || state.dataState.length > 0;

  return (
    <AppShell role="creator" title="Performa Konten">
      {loaded.kind === "ok" ? (
        <ConnectedAccountsPanel accounts={loaded.accounts} outcome={readConnectOutcome(params)} />
      ) : null}

      {loaded.kind === "failed" ? (
        <LoadError title="Akun terhubung tidak bisa dimuat." retryHref={PERFORMANCE_PATH} />
      ) : null}

      {loaded.kind === "signed_out" ? (
        <div role="alert" className="px-5 py-14 text-center">
          <p className="text-[15px] font-semibold">Sesi kamu sudah berakhir.</p>
          <p className="mt-1 text-[13px] text-muted">Masuk lagi untuk menghubungkan akun kamu.</p>
          <a href="/login" className={`mt-4 inline-block ${buttonClasses("accent")}`}>
            Masuk
          </a>
        </div>
      ) : null}

      {/* The creator's own links under the panel (AC 20): read-only rows, ten a page, each
          content opening in Task Saya's Detail Konten, where its steps are. */}
      {loaded.kind !== "signed_out" ? (
        <section aria-labelledby={LINKS_TITLE_ID} className="mt-4">
          {/* The page holds two things, the accounts above and the links below, so the links say which. */}
          <h2 id={LINKS_TITLE_ID} className="mb-2 text-base font-extrabold">
            Performa Konten
          </h2>
          <Panel clip={false}>

            {loaded.kind === "ok" ? <ConnectPrompt accounts={loaded.accounts} /> : null}

            <PerformanceFilters />

            {links.kind === "failed" ? (
              <LoadError title="Daftar link tidak bisa dimuat." retryHref={PERFORMANCE_PATH} />
            ) : links.page.items.length === 0 ? (
              <p className="px-5 py-14 text-center text-[13px] text-muted">
                {isFiltered
                  ? "Tidak ada link yang cocok dengan filter"
                  : "Belum ada konten yang dikirim"}
              </p>
            ) : (
              <>
                <LinkPerformanceTable
                  rows={links.page.items}
                  contentHref={(row) => `${MY_TASKS_BASE}?${new URLSearchParams({ content: row.contentId })}`}
                />
                <Pagination
                  basePath={PERFORMANCE_PATH}
                  noun="link"
                  query={buildPerformanceLinksQuery(state)}
                  page={links.page.page}
                  pageSize={links.page.pageSize}
                  total={links.page.total}
                  totalPages={links.page.totalPages}
                />
              </>
            )}
          </Panel>
        </section>
      ) : null}
    </AppShell>
  );
}
