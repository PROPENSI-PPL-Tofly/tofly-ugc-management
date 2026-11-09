"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { digitsOnly } from "@/components/ui/form-classes";

export const CODE_LENGTH = 6;

const BOX =
  "h-11 w-full min-w-0 rounded-(--radius-control) border border-rule bg-surface text-center text-lg font-semibold text-ink tabular-nums aria-invalid:border-red disabled:opacity-60";

interface CodeBoxesProps {
  /** The digits typed so far, a blank where a box is empty; trailing blanks are left off. */
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** The id of the text that explains the boxes or says what is wrong with the code. */
  describedBy?: string;
}

/**
 * Six boxes that behave like one field (PBI-39): typing moves on, Backspace steps back, a code
 * pasted or autofilled into any box fills all six. The code is held only by the parent's state.
 */
export function CodeBoxes({ value, onChange, disabled, invalid, describedBy }: CodeBoxesProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length: CODE_LENGTH }, (_, index) => value[index]?.trim() ?? "");

  function focusBox(index: number) {
    refs.current[Math.min(Math.max(index, 0), CODE_LENGTH - 1)]?.focus();
  }

  function emit(next: string[]) {
    onChange(next.map((char) => char || " ").join("").trimEnd());
  }

  /** Writes digits from `start` on, then puts the cursor after the last one written. */
  function fill(start: number, digits: string) {
    const next = [...chars];
    const written = digits.slice(0, CODE_LENGTH - start);
    for (let offset = 0; offset < written.length; offset += 1) {
      next[start + offset] = written[offset];
    }
    emit(next);
    focusBox(start + written.length);
  }

  function handleChange(index: number, typed: string) {
    // Backspace is handled on keydown; anything else that leaves no digit is ignored.
    const digits = digitsOnly(typed);
    if (digits === "") return;
    const old = chars[index];
    // Typing over a filled box gives the old digit and the new one, either way round: keep the new.
    fill(index, digits.length === 2 && old !== "" ? digits.replace(old, "") : digits);
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = digitsOnly(event.clipboardData.getData("text"));
    if (digits === "") return;
    // A whole code belongs in all six boxes, wherever it was pasted.
    fill(digits.length >= CODE_LENGTH ? 0 : index, digits);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const target = chars[index] !== "" ? index : index - 1;
      if (target < 0) return;
      const next = [...chars];
      next[target] = "";
      emit(next);
      focusBox(target);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
      {chars.map((char, index) => (
        <input
          // The boxes never move or change in number, so their position is their identity.
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} dari ${CODE_LENGTH}`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={char}
          onChange={(event) => handleChange(index, event.target.value)}
          onPaste={(event) => handlePaste(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className={BOX}
        />
      ))}
    </div>
  );
}
