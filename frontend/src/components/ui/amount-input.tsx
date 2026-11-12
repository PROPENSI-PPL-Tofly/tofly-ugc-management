"use client";

import { useState, type InputHTMLAttributes } from "react";
import { amountText, parseAmount } from "@/lib/amount";
import { GroupedNumberInput } from "./grouped-number-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null;
  /** The typed text as a number: null when empty, NaN when it is not a whole number of digits. */
  onChange: (value: number | null) => void;
};

/**
 * A rupiah amount input that shows what was typed, its digits grouped by thousands (1.500.000).
 * The form receives the number it means, or NaN for text that is not digits, and says what is
 * wrong; no digit is dropped or cut without a word, and anything but digits stays as typed.
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
    <GroupedNumberInput
      {...rest}
      value={text}
      onChange={(shown) => {
        setText(shown);
        onChange(parseAmount(shown));
      }}
    />
  );
}
