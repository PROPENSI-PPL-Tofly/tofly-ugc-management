"use client";

import { useState } from "react";
import { ContentDetailPanel } from "@/components/content-detail/content-detail-panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PanelHead } from "@/components/ui/panel";
import { currentAndHistory, type CreatorInvoice } from "@/lib/creator-invoice";
import { CreatorInvoiceView } from "./creator-invoice-view";
import { InvoiceHistory } from "./invoice-history";

const PANEL = "rounded-(--radius-panel) border border-rule bg-surface shadow-whisper";

/**
 * The Pembayaran page's body (PBI-13, subtask 13.3): the latest contract's invoice in full, the
 * earlier ones in a history whose Rincian opens the same view in a side sheet, and a content's
 * Content Detail from any line's name.
 *
 * One layer on screen, as the prototype keeps it: a content's detail opened from an earlier
 * invoice puts that invoice aside, and closing the detail brings it back where it was.
 */
export function CreatorInvoices({ invoices }: Readonly<{ invoices: readonly CreatorInvoice[] }>) {
  const { current, history } = currentAndHistory(invoices);
  const [opened, setOpened] = useState<CreatorInvoice | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Invoice Periode Ini" className={PANEL}>
        <PanelHead title="Invoice Periode Ini" />
        {current === null ? (
          <EmptyState title="Belum ada invoice." hint="Invoice muncul setelah kontrak pertama kamu dibuat." />
        ) : (
          <div className="px-5 pb-5">
            <CreatorInvoiceView invoice={current} onOpenContent={setContentId} />
          </div>
        )}
      </section>

      {current === null ? null : (
        <section aria-label="Riwayat Invoice" className={`overflow-hidden ${PANEL}`}>
          <PanelHead title="Riwayat Invoice" />
          <InvoiceHistory invoices={history} onOpen={setOpened} />
        </section>
      )}

      {opened !== null && contentId === null ? (
        <Modal
          title={`Invoice Periode ${opened.periodNumber}`}
          placement="side"
          onClose={() => setOpened(null)}
          footer={<Button onClick={() => setOpened(null)}>Tutup</Button>}
        >
          <CreatorInvoiceView invoice={opened} onOpenContent={setContentId} />
        </Modal>
      ) : null}

      {contentId === null ? null : (
        <ContentDetailPanel key={contentId} contentId={contentId} role="creator" onClose={() => setContentId(null)} />
      )}
    </div>
  );
}
