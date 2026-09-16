import type { ReactNode } from "react";

// The pill is reserved for a judgement — the productivity band and content outcomes. Plain
// statuses use a dot with text instead (see StatusDot), so the eye can tell the two apart.
export type Tone = "neutral" | "blue" | "green" | "amber" | "red";

const PILL_TONES: Record<Tone, string> = {
  neutral: "bg-surface-low text-ink-soft",
  blue: "bg-blue-wash text-blue-deep",
  green: "bg-green-wash text-green",
  amber: "bg-amber-wash text-amber",
  red: "bg-red-wash text-red",
};

const DOT_TONES: Record<Tone, string> = {
  neutral: "bg-line-strong",
  blue: "bg-blue",
  green: "bg-green",
  amber: "bg-amber",
  red: "bg-red",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT_TONES[tone]}`} />
      {children}
    </span>
  );
}
