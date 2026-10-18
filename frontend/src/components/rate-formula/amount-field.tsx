"use client";

import { useId } from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { FIELD, FIELD_ERROR } from "@/components/ui/form-classes";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * A required rupiah field of the rate formula: its label with the ⓘ that explains it, a
 * digits-only input, and the message about it right below. The label is tied to the input with
 * htmlFor, so the ⓘ sits beside the label rather than inside it and stays out of the input's name.
 */
export function AmountField({
  label,
  hint,
  value,
  error,
  onChange,
  onBlur,
  tipAlign,
}: {
  label: string;
  /** What the field means, shown behind the ⓘ. */
  hint: string;
  value: number | null;
  error?: string;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  tipAlign?: "start" | "end";
}) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 text-[13px] font-semibold">
        <label htmlFor={inputId}>
          {label}
          <span aria-hidden="true" className="ml-0.5 text-red-ink">
            *
          </span>
        </label>
        <InfoTip label={`Info ${label}`} text={hint} align={tipAlign} />
      </div>
      <AmountInput
        id={inputId}
        className={FIELD}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      />
      {error ? (
        <span id={errorId} className={FIELD_ERROR}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
