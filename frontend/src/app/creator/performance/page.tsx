import { ConnectedAccountsPanel } from "@/components/performance/connected-accounts-panel";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClasses } from "@/components/ui/button-classes";
import { LoadError } from "@/components/ui/load-error";
import {
  ConnectedAccountsError,
  PERFORMANCE_PATH,
  readConnectOutcome,
  type ConnectedAccount,
} from "@/lib/connected-accounts";
import { fetchMyConnectedAccounts } from "@/lib/connected-accounts.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Performa — Tofly",
};

type Loaded = { kind: "ok"; accounts: ConnectedAccount[] } | { kind: "signed_out" } | { kind: "failed" };

async function load(): Promise<Loaded> {
  try {
    return { kind: "ok", accounts: await fetchMyConnectedAccounts() };
  } catch (error) {
    return error instanceof ConnectedAccountsError && error.status === 401
      ? { kind: "signed_out" }
      : { kind: "failed" };
  }
}

/**
 * The creator's Performa page (PBI-19, subtask 19.4), where a creator connects their Instagram
 * and TikTok accounts and where every connect lands back. The content performance list below the
 * panel is PBI-27 (27.6). A failed load says so with a way to try again, never an empty panel
 * that would claim nothing is connected.
 */
export default async function CreatorPerformancePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [loaded, params] = await Promise.all([load(), searchParams]);

  return (
    <AppShell role="creator" title="Performa" subtitle="Data performa konten kamu">
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
    </AppShell>
  );
}
