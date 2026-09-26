"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "accent" | "ghost";

// Same control vocabulary as the pagination links: brand blue carries the primary
// action, everything else stays on the blue-tinted neutral scale.
const VARIANTS: Record<Variant, string> = {
  default: "border-rule bg-surface text-ink hover:border-ink-2 active:bg-surface-2",
  accent: "border-accent-deep bg-accent text-accent-ink hover:bg-accent-deep",
  ghost: "border-transparent bg-transparent text-muted hover:border-rule-2 hover:text-ink",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** The button look on its own, for a link that should read as a button (e.g. a page's main way in). */
export function buttonClasses(variant: Variant = "default"): string {
  return `cursor-pointer rounded-(--radius-control) border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]}`;
}

export function Button({ variant = "default", className = "", ...props }: ButtonProps) {
  return <button {...props} className={`${buttonClasses(variant)} ${className}`} />;
}
