"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "accent" | "ghost";

const VARIANTS: Record<Variant, string> = {
  default: "border-line-strong bg-surface text-ink hover:border-ink",
  accent: "border-ink bg-ink text-white hover:bg-black",
  ghost: "border-transparent bg-transparent text-muted hover:border-line hover:text-ink",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "default", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-[6px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}
