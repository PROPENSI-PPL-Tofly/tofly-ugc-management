"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { FIELD } from "@/components/ui/form-classes";

export const CODE_LENGTH = 6;

const HOLE = " ";

/** The value with each box's digit at its place; an empty box is a space, trailing ones dropped. */
function withDigit(value: string, index: number, digit: string): string {
  const chars = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? HOLE);
  chars[index] = digit || HOLE;
  return chars.join("").trimEnd();
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * The six boxes of a sign-in code (PBI-39 AC 7). `value` holds up to six characters, a space for
 * an empty box; the code is complete when it is six digits. A code pasted into any box, or filled
 * into one by the phone, fills them all.
 */
export function CodeBoxes({
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  function focus(index: number) {
    // Every box is mounted while the group is: the refs are set before any event can fire.
    (boxes.current[Math.min(index, CODE_LENGTH - 1)] as HTMLInputElement).focus();
  }

  function fill(text: string) {
    const digits = digitsOf(text);
    if (digits === "") return;
    onChange(digits);
    focus(digits.length);
  }

  function type(index: number, typed: string) {
    if (typed === "") {
      onChange(withDigit(value, index, ""));
      return;
    }
    const digits = digitsOf(typed);
    if (digits.length > 1) {
      fill(digits);
      return;
    }
    if (digits === "") return;
    onChange(withDigit(value, index, digits));
    focus(index + 1);
  }

  function keyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Backspace" || index === 0 || (value[index] ?? HOLE) !== HOLE) return;
    event.preventDefault();
    onChange(withDigit(value, index - 1, ""));
    focus(index - 1);
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fill(event.clipboardData.getData("text"));
  }

  return (
    <div role="group" aria-label="Kode 6 digit" className="flex justify-between gap-2">
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(box) => {
            boxes.current[index] = box;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} dari ${CODE_LENGTH}`}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          value={(value[index] ?? "").trim()}
          onChange={(event) => type(index, event.target.value)}
          onKeyDown={(event) => keyDown(index, event)}
          onPaste={paste}
          onFocus={(event) => event.target.select()}
          className={`${FIELD} size-11 px-0 text-center text-lg font-semibold tabular-nums`}
        />
      ))}
    </div>
  );
}
