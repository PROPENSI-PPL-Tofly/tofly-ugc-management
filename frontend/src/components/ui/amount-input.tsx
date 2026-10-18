"use client";

import { useState, type InputHTMLAttributes } from "react";
import { NUMERIC_INPUT } from "@/components/ui/form-classes";
import { amountText, parseAmount } from "@/lib/amount";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null;
  /** The typed text as a number: null when empty, NaN when it is not a whole number of digits. */
  onChange: (value: number | null) => void;
};

/**
 * A rupiah amount input that shows exactly what was typed. The form receives the number it
 * means, or NaN for text that is not digits, and says what is wrong; nothing typed is dropped or
 * cut without a word, so "1.5" can never quietly become 15.
 */
export function AmountInput({ value, onChange, ...rest }: Props) {
  const [text, setText] = useState(() => amountText(value));
  const [held, setHeld] = useState(value);

  // A value set from outside (a reset, a saved formula loaded) replaces the text, unless the
  // text already means it; Object.is so a NaN the input reported counts as its own.
  if (!Object.is(held, value)) {
    setHeld(value);
    if (!Object.is(parseAmount(text), value)) setText(amountText(value));
  }

  return (
    <input
      {...NUMERIC_INPUT}
      {...rest}
      value={text}
      onChange={(event) => {
        const typed = event.target.value;
        setText(typed);
        onChange(parseAmount(typed));
      }}
    />
  );
}
