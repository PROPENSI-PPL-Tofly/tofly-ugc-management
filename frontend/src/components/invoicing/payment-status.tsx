import { formatTimestamp } from "@/lib/format";
import type { InvoicePayment } from "@/lib/invoice-payment-api";

// What a step that has not happened yet reads as.
const NOT_YET = "Belum";

const TERM = "text-muted";
const VALUE = "text-right tabular-nums";

// Where the payment stands, in the Rincian panel (PBI-13, subtask 13.4): when the creator
// acknowledged the invoice, the proof the admin uploaded, and when the creator confirmed receipt.
export function PaymentStatus({ payment }: Readonly<{ payment: InvoicePayment }>) {
  return (
    <section aria-label="Pembayaran" className="flex flex-col gap-1.5">
      <h3 className="text-[13px] font-bold">Pembayaran</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className={TERM}>Diakui creator</dt>
        <dd className={VALUE}>
          {payment.acknowledgedAt ? formatTimestamp(payment.acknowledgedAt) : NOT_YET}
        </dd>

        <dt className={TERM}>Bukti pembayaran</dt>
        <dd className={VALUE}>
          {payment.proof ? (
            <a
              href={payment.proof.href ?? undefined}
              className="underline decoration-rule underline-offset-[3px] hover:decoration-ink"
            >
              {payment.proof.fileName}
            </a>
          ) : (
            NOT_YET
          )}
        </dd>

        <dt className={TERM}>Penerimaan dikonfirmasi</dt>
        <dd className={VALUE}>
          {payment.receivedAt ? formatTimestamp(payment.receivedAt) : NOT_YET}
        </dd>
      </dl>
    </section>
  );
}
