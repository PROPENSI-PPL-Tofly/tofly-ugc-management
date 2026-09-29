"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import type { CreatorFormErrors } from "@/lib/creator-form";
import { createCreator, type NewCreatorRequest } from "@/lib/creators";
import { AddCreatorModal } from "./add-creator-modal";

interface SaveFailure {
  message?: string;
  errors: CreatorFormErrors;
}

const NO_FAILURE: SaveFailure = { errors: {} };

/**
 * Owns the open/closed state for AddCreatorModal, kept separate from CreatorTable's
 * row-scoped CreatorDetailModal state since adding a creator is not a per-row action.
 *
 * Simpan posts the creator; on 201 the modal closes and router.refresh() re-runs the page's
 * server fetch, so the new row shows up in the Creator Database without a full reload.
 */
export function AddCreatorTrigger({
  existingEmails = [],
}: {
  /** Passed straight through to AddCreatorModal — see its own prop for what this covers. */
  existingEmails?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure>(NO_FAILURE);
  // The id is the Toast key: a second save remounts it, restarting its countdown.
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  // Stable, so the modal's discard guard is not rebuilt on every render.
  const close = useCallback(() => {
    setOpen(false);
    setFailure(NO_FAILURE);
  }, []);

  async function save(request: NewCreatorRequest) {
    setSaving(true);
    const result = await createCreator(request);
    setSaving(false);

    if (result.ok) {
      close();
      setToast((last) => ({
        id: (last?.id ?? 0) + 1,
        message: `Creator ${request.name.trim()} berhasil ditambahkan.`,
      }));
      router.refresh();
      return;
    }

    // Field messages are shown under their inputs; the general message only when none are.
    const hasFieldErrors = Object.keys(result.errors).length > 0;
    setFailure({
      errors: result.errors,
      message: hasFieldErrors ? undefined : result.message,
    });
  }

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}>
        + Tambah Creator
      </Button>

      {open ? (
        <AddCreatorModal
          onClose={close}
          onSubmit={save}
          loading={saving}
          existingEmails={existingEmails}
          serverErrors={failure.errors}
          formError={failure.message}
        />
      ) : null}

      {toast ? (
        <Toast key={toast.id} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}
    </>
  );
}
