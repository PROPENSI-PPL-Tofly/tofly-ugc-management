import { RateFormulaTrigger } from "@/components/rate-formula/rate-formula-trigger";
import { AppShell } from "@/components/shell/app-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { Panel } from "@/components/ui/panel";

export const metadata = {
  title: "Rate & Invoicing — Tofly",
};

const FORMULA = "Final Rate = Fixed Rate + Konten Tambahan + Bonus − Penalti";

/**
 * The Rate & Invoicing page (PBI-8). This is its frame: the page header and the panel head with
 * the formula behind its ⓘ and the Atur Formula Rate button (subtask 8.2). The per-creator table
 * and its filters belong to subtask 8.4 and go below the head.
 */
export default function RateInvoicingPage() {
  return (
    <AppShell title="Rate & Invoicing" subtitle="Total invoice per creator dan statusnya">
      <Panel clip={false}>
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className="flex items-center gap-1.5 text-[15px]">
            Rate & Invoicing
            <InfoTip label="Info Rate & Invoicing" text={FORMULA} />
          </h2>
          <RateFormulaTrigger />
        </div>
      </Panel>
    </AppShell>
  );
}
