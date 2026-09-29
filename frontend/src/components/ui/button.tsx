"use client";

import type { ComponentPropsWithRef } from "react";
import { buttonClasses, type Variant } from "./button-classes";

// With ref, so a dialog can start focus on a particular button (React 19 passes ref as a prop).
interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: Variant;
}

export function Button({ variant = "default", className = "", ...props }: ButtonProps) {
  return <button {...props} className={`${buttonClasses(variant)} ${className}`} />;
}
