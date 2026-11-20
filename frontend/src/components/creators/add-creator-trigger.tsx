"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { CreatorFormErrors } from "@/lib/creator-form";
import { createCreator } from "@/lib/creators";
import { AddCreatorModal } from "./add-creator-modal";
import { useFormSave } from "./use-form-save";

const NO_ERRORS: CreatorFormErrors = {};

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
  const { show: confirm, toast } = useToast();
  const form = useFormSave(
    createCreator,
    (request) => {
      confirm(`Creator ${request.name.trim()} berhasil ditambahkan.`);
      router.refresh();
    },
    NO_ERRORS,
  );

  return (
    <>
      <Button variant="accent" onClick={form.openForm}>
        + Tambah Creator
      </Button>

      {form.open ? (
        <AddCreatorModal
          onClose={form.close}
          onSubmit={form.submit}
          loading={form.saving}
          existingEmails={existingEmails}
          serverErrors={form.serverErrors}
          formError={form.formError}
        />
      ) : null}

      {toast}
    </>
  );
}
