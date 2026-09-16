import type { ReactNode } from "react";

// The three tones the interface uses to say "fine", "watch this" and "act on this". Kept as
// one component so a status never invents its own colour pairing somewhere down the tree.
export type PillTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONES: Record<PillTone, string> = {
  neutral: "bg-paper text-muted",
  accent: "bg-accent-dim text-accent",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
