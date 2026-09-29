// Plain module (no "use client") so server components can style a link as a button too;
// a function exported from a client module cannot be called during server rendering.

export type Variant = "default" | "accent" | "ghost" | "attention" | "positive" | "danger";

// Same control vocabulary as the pagination links: brand blue carries the primary
// action, everything else stays on the blue-tinted neutral scale. The three toned variants
// borrow the status colours so an action reads like the state it answers: amber for work that
// came back (a revision), green for the step after an approval, red for throwing work away.
const VARIANTS: Record<Variant, string> = {
  default: "border-rule bg-surface text-ink hover:border-ink-2 active:bg-surface-2",
  accent: "border-accent-deep bg-accent text-accent-ink hover:bg-accent-deep",
  ghost: "border-transparent bg-transparent text-muted hover:border-rule-2 hover:text-ink",
  attention: "border-amber bg-amber-wash text-amber-ink hover:bg-amber/30",
  positive: "border-green bg-green-wash text-green-ink hover:bg-green/15",
  danger: "border-red bg-red text-accent-ink hover:bg-red-ink",
};

/** The button look on its own, for a link that should read as a button (e.g. a page's main way in). */
export function buttonClasses(variant: Variant = "default"): string {
  return `cursor-pointer rounded-(--radius-control) border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]}`;
}
