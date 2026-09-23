import type { ReactNode } from "react";

// The pill is reserved for a judgement — the productivity band. Plain facts such as the
// contract state use a dot beside text (StatusDot) so the eye can tell the two apart.
export type Tone = "neutral" | "accent" | "green" | "amber" | "red";

const PILL_TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-wash text-accent-deep",
  green: "bg-green-wash text-green-ink",
  amber: "bg-amber-wash text-amber-ink",
  red: "bg-red-wash text-red-ink",
};

const DOT_TONES: Record<Tone, string> = {
  neutral: "bg-rule",
  accent: "bg-accent",
  green: "bg-green",
  amber: "bg-amber",
  red: "bg-red",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-ink-2">
      <span aria-hidden="true" className={`size-2 rounded-full ${DOT_TONES[tone]}`} />
      {children}
    </span>
  );
}
