"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import {
  COMMENT_MAX_LENGTH,
  instantDay,
  invoiceActivity,
  validateComment,
  type CreatorInvoice,
} from "@/lib/creator-invoice";
import { addInvoiceComment } from "@/lib/creator-invoice-actions.server";
import { formatTimestamp } from "@/lib/format";
import { useCreatorMove } from "./use-creator-move";

/**
 * An invoice's Aktivitas & Komentar (PBI-13, subtask 13.3): every step it reached and every
 * comment, oldest first, then a field to write to the admin. The thread is open at every status,
 * a paid invoice included. Comments render as text, never as markup (OWASP A05), and the field
 * stops at the 500 characters the server takes, saying so out loud when it is full.
 */
export function InvoiceActivity({
  invoice,
  onCommented,
}: Readonly<{
  invoice: CreatorInvoice;
  /** A comment was accepted; the invoice reads again. */
  onCommented: () => void;
}>) {
  const entries = invoiceActivity(invoice);
  const [text, setText] = useState("");
  const { busy, refusal, run } = useCreatorMove();
  const fieldId = useId();
  const countId = useId();

  function send() {
    return run(
      () => addInvoiceComment(invoice.contractId, text),
      () => {
        setText("");
        onCommented();
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 ? (
        <p className="py-5 text-center text-[13px] text-muted">Belum ada aktivitas atau komentar.</p>
      ) : (
        <ul aria-label="Aktivitas & komentar" className="divide-y divide-dashed divide-rule">
          {entries.map((entry) =>
            entry.kind === "event" ? (
              <li key={entry.id} className="flex justify-between gap-3 py-2 text-[12.5px] text-muted">
                <span>{entry.text}</span>
                <span className="whitespace-nowrap">{instantDay(entry.at)}</span>
              </li>
            ) : (
              <li key={entry.id} className="py-2">
                <strong className="text-xs">{entry.author}</strong>
                <span className="ml-1.5 text-xs text-muted">{formatTimestamp(entry.at)}</span>
                <p className="mt-0.5 text-[12.5px] whitespace-pre-wrap wrap-anywhere">{entry.text}</p>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="sr-only">
          Komentar
        </label>
        <textarea
          id={fieldId}
          value={text}
          maxLength={COMMENT_MAX_LENGTH}
          rows={3}
          aria-describedby={countId}
          // Locked while sending: success empties the field, and must not take what was typed since.
          disabled={busy}
          placeholder="Tulis komentar untuk Admin..."
          onChange={(event) => setText(event.target.value)}
          className="w-full resize-y rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-[13px] focus-visible:border-focus focus-visible:outline-none"
        />
        <CharLimit id={countId} length={text.length} max={COMMENT_MAX_LENGTH} />
        {refusal === null ? null : (
          <p role="alert" className="text-xs text-red-ink">
            {refusal}
          </p>
        )}
        <div className="flex justify-end">
          <Button onClick={send} disabled={busy || validateComment(text) !== null}>
            Kirim Komentar
          </Button>
        </div>
      </div>
    </div>
  );
}
