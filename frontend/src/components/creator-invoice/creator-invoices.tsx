"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContentDetailPanel } from "@/components/content-detail/content-detail-panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PanelBand } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { currentAndHistory, type CreatorInvoice, type CreatorInvoiceAction } from "@/lib/creator-invoice";
import { CreatorInvoiceView } from "./creator-invoice-view";
import { InvoiceHistory } from "./invoice-history";
import { InvoiceMove } from "./invoice-move";

// The invoice in play edged in the creator's accent, the history in the quieter rule colour.
const PANEL = "rounded-(--radius-panel) border-[1.5px] bg-surface shadow-whisper";

/**
 * The Pembayaran page's body (PBI-13, subtask 13.3): the latest contract's invoice in full, the
 * earlier ones in a history whose Rincian opens the same view in a side sheet, and a content's
 * Content Detail from any line's name.
 *
 * After a move or a comment the page reads the invoices again from the server rather than
 * guessing the new state here, so what the creator sees is always what the backend holds. The
 * open earlier invoice is remembered by its contract and read from the fresh list, so it shows
 * its new status too, and closes if it is no longer there.
 *
 * One layer on screen, as the prototype keeps it: a content's detail opened from an earlier
 * invoice puts that invoice aside, and closing the detail brings it back where it was.
 */
export function CreatorInvoices({ invoices }: Readonly<{ invoices: readonly CreatorInvoice[] }>) {
  const router = useRouter();
  const { show, toast } = useToast();
  const { current, history } = currentAndHistory(invoices);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const opened = history.find((invoice) => invoice.contractId === openedId) ?? null;

  function readAgain() {
    router.refresh();
  }

  /** The move control for one invoice, which the view places when the move is due. */
  function renderAction(invoice: CreatorInvoice) {
    return function renderMove(action: CreatorInvoiceAction) {
      return (
        <InvoiceMove
          action={action}
          contractId={invoice.contractId}
          onDone={(message) => {
            show(message);
            readAgain();
          }}
        />
      );
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Invoice Periode Ini" className={`border-accent/35 ${PANEL}`}>
        <PanelBand title="Invoice Periode Ini" tone="accent" />
        {current === null ? (
          <EmptyState title="Belum ada invoice." hint="Invoice muncul setelah kontrak pertama kamu dibuat." />
        ) : (
          <div className="px-5 pt-4 pb-5 max-sm:px-4">
            <CreatorInvoiceView
              invoice={current}
              onOpenContent={setContentId}
              renderAction={renderAction(current)}
              onCommented={readAgain}
            />
          </div>
        )}
      </section>

      {current === null ? null : (
        <section aria-label="Riwayat Invoice" className={`overflow-hidden border-rule ${PANEL}`}>
          <PanelBand title="Riwayat Invoice" tone="quiet" count={history.length} noun="invoice" />
          <InvoiceHistory invoices={history} onOpen={(invoice) => setOpenedId(invoice.contractId)} />
        </section>
      )}

      {opened !== null && contentId === null ? (
        <Modal
          title={`Invoice Periode ${opened.periodNumber}`}
          placement="side"
          onClose={() => setOpenedId(null)}
          footer={<Button onClick={() => setOpenedId(null)}>Tutup</Button>}
        >
          <CreatorInvoiceView
            invoice={opened}
            onOpenContent={setContentId}
            renderAction={renderAction(opened)}
            onCommented={readAgain}
          />
        </Modal>
      ) : null}

      {contentId === null ? null : (
        <ContentDetailPanel key={contentId} contentId={contentId} role="creator" onClose={() => setContentId(null)} />
      )}

      {toast}
    </div>
  );
}
