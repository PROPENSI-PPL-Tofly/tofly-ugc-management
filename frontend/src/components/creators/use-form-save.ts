"use client";

import { useCallback, useState } from "react";

/** What a form's save answers: done, or why not, per field and as a whole. */
export type SaveResult<E> = { ok: true } | { ok: false; message: string; errors: E };

interface SaveFailure<E> {
  message?: string;
  errors: E;
}

/**
 * A modal form's open/saving/failure state around one save call, shared by Tambah Creator,
 * Perpanjang Kontrak and Ubah Periode: field messages go under their inputs, the general message
 * only when no field has one, and closing the form forgets the last failure.
 */
export function useFormSave<R, E extends object>(
  save: (request: R) => Promise<SaveResult<E>>,
  onSaved: (request: R) => void,
  noErrors: E,
) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure<E>>({ errors: noErrors });

  // Stable, so the modal's discard guard is not rebuilt on every render.
  const close = useCallback(() => {
    setOpen(false);
    setFailure({ errors: noErrors });
  }, [noErrors]);

  async function submit(request: R) {
    setSaving(true);
    const result = await save(request);
    setSaving(false);

    if (result.ok) {
      close();
      onSaved(request);
      return;
    }

    const hasFieldErrors = Object.keys(result.errors).length > 0;
    setFailure({ errors: result.errors, message: hasFieldErrors ? undefined : result.message });
  }

  return {
    open,
    openForm: () => setOpen(true),
    close,
    submit,
    saving,
    serverErrors: failure.errors,
    formError: failure.message,
  };
}
