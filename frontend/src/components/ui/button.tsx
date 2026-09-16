"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  default: "border-line-strong bg-surface text-ink hover:border-ink",
  primary: "border-blue bg-blue text-white hover:border-blue-deep hover:bg-blue-deep",
  ghost: "border-transparent bg-transparent text-ink-soft hover:bg-surface-low hover:text-ink",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "default", className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`cursor-pointer rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}
