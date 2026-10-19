import { CreatorInvoices } from "@/components/creator-invoice/creator-invoices";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClasses } from "@/components/ui/button-classes";
import { LoadError } from "@/components/ui/load-error";
import { CREATOR_INVOICES_PATH, CreatorInvoicesError, type CreatorInvoice } from "@/lib/creator-invoice";
import { fetchMyInvoices } from "@/lib/creator-invoice.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pembayaran — Tofly",
};

type Loaded = { kind: "ok"; invoices: CreatorInvoice[] } | { kind: "signed_out" } | { kind: "failed" };

async function load(): Promise<Loaded> {
  try {
    return { kind: "ok", invoices: await fetchMyInvoices() };
  } catch (error) {
    return error instanceof CreatorInvoicesError && error.status === 401
      ? { kind: "signed_out" }
      : { kind: "failed" };
  }
}

/**
 * The creator's Pembayaran page (PBI-13, subtask 13.3): every invoice of their own, with its
 * status and breakdown. A failed load says so with a way to try again, never an empty page that
 * would claim there is nothing to be paid; a session that ended asks to sign in again.
 */
export default async function CreatorPaymentsPage() {
  const loaded = await load();

  return (
    <AppShell role="creator" title="Pembayaran" subtitle="Invoice kamu per periode kontrak">
      {loaded.kind === "ok" ? <CreatorInvoices invoices={loaded.invoices} /> : null}

      {loaded.kind === "failed" ? (
        <LoadError title="Invoice tidak bisa dimuat." retryHref={CREATOR_INVOICES_PATH} />
      ) : null}

      {loaded.kind === "signed_out" ? (
        <div role="alert" className="px-5 py-14 text-center">
          <p className="text-[15px] font-semibold">Sesi kamu sudah berakhir.</p>
          <p className="mt-1 text-[13px] text-muted">Masuk lagi untuk melihat invoice kamu.</p>
          <a href="/login" className={`mt-4 inline-block ${buttonClasses("accent")}`}>
            Masuk
          </a>
        </div>
      ) : null}
    </AppShell>
  );
}
