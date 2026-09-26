"use client";

import type { ButtonHTMLAttributes } from "react";
import { buttonClasses, type Variant } from "./button-classes";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "default", className = "", ...props }: ButtonProps) {
  return <button {...props} className={`${buttonClasses(variant)} ${className}`} />;
}
