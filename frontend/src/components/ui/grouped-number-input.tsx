"use client";

import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { NUMERIC_INPUT } from "@/components/ui/form-classes";
import { caretAfterDigits, digitsBefore, groupDigits } from "@/lib/grouped-number";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** The text as shown, already grouped. */
  value: string;
  /** The typed text, grouped by thousands when it is digits. */
  onChange: (text: string) => void;
};

/**
 * A number field whose digits are grouped by thousands as they are typed (1000 shows 1.000). The
 * caret keeps its place among the digits however the dots move, so typing in the middle of a
 * number does not throw it to the end.
 */
export function GroupedNumberInput({ value, onChange, ...rest }: Props) {
  const input = useRef<HTMLInputElement>(null);
  // Where the caret should go once the regrouped text is on screen: after this many digits.
  const caretDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = input.current;
    if (!element || caretDigits.current === null || document.activeElement !== element) return;
    const position = caretAfterDigits(value, caretDigits.current);
    element.setSelectionRange(position, position);
    caretDigits.current = null;
  }, [value]);

  return (
    <input
      {...NUMERIC_INPUT}
      {...rest}
      ref={input}
      value={value}
      onChange={(event) => {
        const typed = event.target.value;
        const grouped = groupDigits(typed);
        caretDigits.current =
          grouped === typed ? null : digitsBefore(typed, event.target.selectionStart ?? typed.length);
        onChange(grouped);
      }}
    />
  );
}
