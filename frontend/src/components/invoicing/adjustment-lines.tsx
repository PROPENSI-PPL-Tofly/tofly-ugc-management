import type { AdjustmentLine } from "@/lib/invoice-adjustment";
import { adjustmentLabel } from "@/lib/invoice-adjustment";
import { formatTimestamp } from "@/lib/format";

/**
 * The manual adjustments of one invoice, as the breakdown lists them: what each one moved, why,
 * and when. Rendered as text (OWASP A03), never as anything a reason could pretend to be.
 */
export function AdjustmentLines({
  adjustments,
}: Readonly<{ adjustments: readonly AdjustmentLine[] }>) {
  return (
    <ul className="flex flex-col gap-1.5 text-[13px]">
      {adjustments.map((adjustment) => (
        <li key={adjustment.id} className="flex items-start justify-between gap-4">
          <span>
            <span className="wrap-anywhere">{adjustment.reason}</span>
            <span className="block text-xs text-muted">{formatTimestamp(adjustment.createdAt)}</span>
          </span>
          <span className="whitespace-nowrap tabular-nums">
            {adjustmentLabel(adjustment.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
