import { InvoiceFilters } from "@/components/invoice/invoice-filters";
import { InvoiceBoard } from "@/components/invoicing/invoice-board";
import { RateFormulaTrigger } from "@/components/rate-formula/rate-formula-trigger";
import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelBand } from "@/components/ui/panel";
import { formatRupiah } from "@/lib/format";
import {
  buildInvoiceQuery,
  INVOICE_PAGE_SIZE,
  INVOICE_PATH,
  invoiceHref,
  parseInvoiceParams,
  type InvoiceList,
} from "@/lib/invoice";
import { fetchRateInvoices } from "@/lib/invoice.server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rate & Invoicing — Tofly",
};

/**
 * The Rate & Invoicing table (PBI-8, subtask 8.4): every creator's fixed rate, additional
 * content, bonus, penalty and where their invoice stands, in the structure the prototype draws
 * it. Fetched on the server so the first paint already has the data. The URL is the only state:
 * the search word, the filters and the page number come in as search params, which keeps a view
 * linkable and reload-safe. When the list cannot be loaded the page offers a retry rather than
 * a table it cannot fill.
 */
export default async function RateInvoicingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseInvoiceParams(await searchParams);

  let list: InvoiceList | undefined;
  try {
    list = await fetchRateInvoices(state);
  } catch {
    // A request that failed is not a list that is empty: this one is offered again.
    list = undefined;
  }

  return (
    <AppShell
      title="Rate & Invoicing"
      subtitle="Fixed rate, konten tambahan, bonus, penalti, dan invoice berjalan setiap creator"
    >
      {list ? (
        <>
        {/* The approved design leads with the filtered list's sum, the rule that makes it beside. */}
        <section
          aria-label="Ringkasan"
          className="mb-4 flex flex-col gap-3 rounded-(--radius-panel) bg-ink px-5 py-4 text-accent-ink max-sm:px-4"
        >
          <div>
            <p className="text-xs font-semibold text-rule">{`Total ${list.total} invoice`}</p>
            <p className="mt-0.5 text-[28px] leading-tight font-extrabold tabular-nums">
              {formatRupiah(list.summary.total)}
            </p>
          </div>
          <p className="text-xs leading-normal text-rule">Total = Fixed Rate + Konten Tambahan + Bonus − Penalti</p>
        </section>

        <Panel>
          {/* The ⓘ that explains Total sits on the Total header; the formula button stays in the
              panel head, where subtask 8.2 puts it. */}
          <PanelBand
            title="Invoice"
            tone="ink"
            icon="receipt"
            count={list.total}
            noun="invoice"
            action={<RateFormulaTrigger runningInvoices={list.summary.runningInvoices} />}
          />

          {list.summary.formulaSet ? null : (
            <p
              role="status"
              aria-label="Formula rate belum diatur"
              className="mx-5 mt-3 mb-3 rounded-(--radius-control) border border-amber bg-amber-wash px-3 py-2 text-[13px] text-amber-ink"
            >
              Formula rate belum diatur. Fee konten tambahan dan penalti belum dihitung sampai formula
              disimpan lewat Atur Formula Rate.
            </p>
          )}

          <InvoiceFilters />
          {/* The table, with each money cell opening its breakdown (8.5). */}
          <InvoiceBoard
            rows={list.rows}
            sort={{ key: state.sort, order: state.order }}
            summary={{ total: list.summary.total, count: list.total }}
          />
          {/* Stays on show on a single page: a table that always carries its footer (4.2). */}
          <Pagination
            basePath={INVOICE_PATH}
            noun="invoice"
            query={buildInvoiceQuery(state)}
            always
            page={list.page}
            pageSize={INVOICE_PAGE_SIZE}
            total={list.total}
            totalPages={list.totalPages}
          />
        </Panel>
        </>
      ) : (
        <Panel>
          <LoadError title="Rate & Invoicing tidak bisa dimuat." retryHref={invoiceHref(state)} />
        </Panel>
      )}
    </AppShell>
  );
}
