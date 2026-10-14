"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  BREAKDOWN_LABELS,
  breakdownPopup,
  type BreakdownKind,
  type BreakdownTone,
  type InvoiceBreakdown,
} from "@/lib/invoice-breakdown";

const TONES: Record<BreakdownTone, string> = {
  plain: "text-ink",
  danger: "text-red-ink",
};

const ROW = "flex items-start justify-between gap-4 py-2 text-[12.5px]";

const NAME =
  "cursor-pointer border-none bg-transparent p-0 text-left font-bold text-ink wrap-anywhere transition-colors hover:text-accent-deep focus-visible:text-accent-deep";

/** The lines of a breakdown that has arrived, with their total and any note under them. */
function Lines({
  kind,
  breakdown,
  onOpenContent,
}: Readonly<{
  kind: BreakdownKind;
  breakdown: InvoiceBreakdown;
  onOpenContent: (contentId: string) => void;
}>) {
  const view = breakdownPopup(kind, breakdown);

  return (
    <>
      {view.lines.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">{view.empty}</p>
      ) : (
        <div>
          <ul className="divide-y divide-dashed divide-rule">
            {view.lines.map((line) => {
              const { contentId } = line;

              return (
                <li key={line.key} className={ROW}>
                  <div className="min-w-0">
                    {contentId === null ? (
                      <strong className="wrap-anywhere">{line.name}</strong>
                    ) : (
                      <button
                        type="button"
                        title="Buka detail konten"
                        className={NAME}
                        onClick={() => onOpenContent(contentId)}
                      >
                        {line.name}
                      </button>
                    )}
                    <p className="text-xs text-muted">{line.detail}</p>
                  </div>
                  <span className={`whitespace-nowrap tabular-nums ${TONES[line.tone]}`}>
                    {line.amount}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className={`${ROW} border-t border-rule font-bold`}>
            <span>Total</span>
            <span className="whitespace-nowrap tabular-nums">{view.total}</span>
          </div>
        </div>
      )}

      {view.note === null ? null : (
        <p role="note" className="text-xs text-muted">
          {view.note}
        </p>
      )}
    </>
  );
}

/**
 * What one money column of a creator's invoice is made of (PBI-8, subtask 8.5): a line per
 * content with how its amount came about, and the column's total. A content's name opens its
 * Content Detail; the popup only reports which one, so the caller decides where the panel goes
 * and the popup stays free of fetching.
 *
 * It opens before its breakdown has arrived, titled already, and says so while it waits; a
 * breakdown that could not be read says that too, with a retry, rather than an empty column
 * that would claim there is nothing in it. One dialog throughout, so focus stays put when the
 * lines arrive.
 */
export function BreakdownPopup({
  kind,
  creatorName,
  breakdown,
  failed,
  onRetry,
  onClose,
  onOpenContent,
}: Readonly<{
  kind: BreakdownKind;
  creatorName: string;
  /** Null until it has been read. */
  breakdown: InvoiceBreakdown | null;
  /** True when reading it failed. */
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
  /** Called with the id of the content whose name was pressed. */
  onOpenContent: (contentId: string) => void;
}>) {
  let body;
  if (failed) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center text-[13px]">
        <p>Rincian tidak bisa dimuat.</p>
        <Button onClick={onRetry}>Coba lagi</Button>
      </div>
    );
  } else if (breakdown === null) {
    body = (
      <p role="status" className="py-6 text-center text-[13px] text-muted">
        Memuat rincian…
      </p>
    );
  } else {
    body = <Lines kind={kind} breakdown={breakdown} onOpenContent={onOpenContent} />;
  }

  return (
    <Modal
      title={`${BREAKDOWN_LABELS[kind]} · ${creatorName}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Tutup</Button>}
    >
      {body}
    </Modal>
  );
}
