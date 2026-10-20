import type { InvoiceStep, StepState } from "@/lib/creator-invoice";

/** The dot and the line into it, per state, as the prototype's tracker draws them. */
const DOT: Record<StepState, string> = {
  done: "border-green bg-green",
  current: "border-ink bg-surface ring-3 ring-rule-2",
  todo: "border-rule bg-surface",
};

const LINE: Record<StepState, string> = {
  done: "bg-green",
  current: "bg-green",
  todo: "bg-rule",
};

/**
 * How far an invoice has walked: Berjalan → Final → Di-ack Creator → Bukti Bayar → Paid, each
 * reached step dated. The current step is marked for a screen reader with aria-current and a
 * done one says so in words, so the progress never lives in colour alone (WCAG 1.4.1).
 */
export function InvoiceTracker({ steps }: Readonly<{ steps: readonly InvoiceStep[] }>) {
  return (
    <ol aria-label="Progres invoice" className="mt-4 mb-1 grid max-w-[680px] grid-cols-5">
      {steps.map((step, index) => (
        <li
          key={step.status}
          aria-current={step.state === "current" ? "step" : undefined}
          className={`relative pt-[18px] text-center text-[11.5px] ${step.state === "todo" ? "text-muted" : "text-ink"} ${step.state === "current" ? "font-semibold" : ""}`}
        >
          <span>{step.label}</span>
          {step.state === "done" ? <span className="sr-only">, selesai</span> : null}
          {step.caption === null ? null : (
            <span className="mt-px block text-[10.5px] font-normal text-muted">{step.caption}</span>
          )}
          {/* Drawn after the words, which a reader meets first; placed absolutely, they sit above. */}
          {index > 0 ? (
            <span aria-hidden="true" className={`absolute top-[9px] -left-1/2 h-0.5 w-full ${LINE[step.state]}`} />
          ) : null}
          <span
            aria-hidden="true"
            className={`absolute top-[5px] left-1/2 z-[1] -ml-[5px] size-2.5 rounded-full border-2 ${DOT[step.state]}`}
          />
        </li>
      ))}
    </ol>
  );
}
