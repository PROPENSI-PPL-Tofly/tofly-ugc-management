"use client";

import { useId, useState } from "react";
import { CharLimit } from "@/components/ui/char-limit";
import { REQUIRED_MARK } from "@/components/ui/form-classes";

export interface NoteFieldProps {
  label: string;
  placeholder: string;
  required: boolean;
  /** What a required note says once it is left empty; why the send button waits. */
  missingMessage?: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * A note form opens from a click on the button that asks for it, so focus follows the admin
 * into the field. Module-level so its identity is stable: React calls it once when the field
 * mounts rather than on every render, which would pull focus back from the form's buttons.
 */
function focusOnMount(element: HTMLTextAreaElement | null) {
  element?.focus();
}

/**
 * The one field every admin note is written in: a revision note, a rejection reason and a
 * follow-up note. Keeping it in one place means the forms can never disagree on the label,
 * the required mark, the limit or when "missing" shows, and the rich text editor replaces the
 * textarea here once for all of them.
 *
 * A form mounts it when it opens and unmounts it when it closes, so "the admin has left the
 * field" starts over with every note.
 */
export function NoteField({
  label,
  placeholder,
  required,
  missingMessage,
  max,
  value,
  onChange,
  disabled = false,
}: Readonly<NoteFieldProps>) {
  // Not flagged while the note is still being started, only once the admin moved on.
  const [left, setLeft] = useState(false);
  const countId = useId();
  const missingId = useId();
  // Blank counts as missing: the backend trims a note before it refuses an empty one.
  const missing = required && left && value.trim() === "";

  return (
    <>
      <label className="flex flex-col gap-1 text-[13px]">
        {/* A required note is marked as every required field is; an optional one is not. */}
        <span className={`font-semibold text-ink ${required ? REQUIRED_MARK : ""}`}>{label}</span>
        <textarea
          ref={focusOnMount}
          required={required}
          maxLength={max}
          aria-describedby={missing ? `${missingId} ${countId}` : countId}
          aria-invalid={required ? missing : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setLeft(true)}
          placeholder={placeholder}
          rows={3}
          disabled={disabled}
          className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink"
        />
      </label>
      {missing ? (
        <p id={missingId} className="text-xs text-red-ink">
          {missingMessage}
        </p>
      ) : null}
      <CharLimit id={countId} length={value.length} max={max} />
    </>
  );
}
