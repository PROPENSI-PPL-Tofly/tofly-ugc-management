import { Pill } from "@/components/ui/pill";
import { EARLY_END_LABEL, earlyEndReasonLabel, earlyEndSentence, type EarlyEnd } from "@/lib/early-end-display";

/**
 * A contract ended early, as the admin views show it (PBI-37, 37.3): the label, the new last day
 * beside the original end (AC 16) and the reason. Creator Database and Creator Detail both draw
 * this one component, so the two always agree. Admin pages only: the reason is never the
 * creator's to read, and the backend sends it only to admins (OWASP A01). Plain JSX text, so
 * whatever arrives is shown and never run (OWASP A05).
 */
export function EarlyEndNote({ lastDay, earlyEnd }: Readonly<{ lastDay: string | null; earlyEnd: EarlyEnd }>) {
  return (
    <div className="mt-1.5">
      {/* Red's near relation, so it reads apart from a contract that ended as agreed. */}
      <Pill tone="redSoft">{EARLY_END_LABEL}</Pill>
      <p className="mt-1 text-xs text-muted">{earlyEndSentence(lastDay, earlyEnd)}</p>
      <p className="text-xs text-muted">{`Alasan: ${earlyEndReasonLabel(earlyEnd)}`}</p>
    </div>
  );
}
