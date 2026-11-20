"use client";

import { useState } from "react";

type Messages<F extends string> = Partial<Record<F, string>>;

/**
 * Which message a form field shows, one rule for Tambah Creator and Perpanjang Kontrak:
 *
 * - the live check's, once the field was left (touched) at least once, so nothing flashes red
 *   the moment a form opens;
 * - otherwise the server's from the last rejected save, until the field is edited, since an
 *   edited value is no longer what the server answered about. A new answer clears the edits.
 */
export function useFieldErrors<F extends string>(liveErrors: Messages<F>, serverErrors: Messages<F>) {
  const [touched, setTouched] = useState<Partial<Record<F, boolean>>>({});
  const [answered, setAnswered] = useState(serverErrors);
  const [edited, setEdited] = useState<Partial<Record<F, boolean>>>({});
  if (answered !== serverErrors) {
    setAnswered(serverErrors);
    setEdited({});
  }

  function markTouched(field: F) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function markEdited(fields: readonly F[]) {
    setEdited((prev) => ({ ...prev, ...Object.fromEntries(fields.map((field) => [field, true])) }));
  }

  function fieldError(field: F): string | undefined {
    const live = touched[field] ? liveErrors[field] : undefined;
    return live ?? (edited[field] ? undefined : serverErrors[field]);
  }

  return { markTouched, markEdited, fieldError };
}
