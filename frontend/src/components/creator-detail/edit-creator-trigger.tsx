"use client";

import { useRouter } from "next/navigation";
import { useFormSave } from "@/components/creators/use-form-save";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { CreatorPeriod, CreatorProfile } from "@/lib/creator-detail";
import { readUsernameLocks, savedMessage, type CreatorEditRequest, type UsernameLocks } from "@/lib/creator-edit";
import { saveCreatorEdit } from "@/lib/creator-edit-api";
import type { CreatorFormErrors } from "@/lib/creator-form";
import { readConnections } from "@/lib/social-connection";
import { EditCreatorModal } from "./edit-creator-modal";

const NO_ERRORS: CreatorFormErrors = {};

/**
 * "Ubah Data" on Creator Detail's profile (PBI-16 AC 1): opens the edit form for the creator and
 * the period whose tab is open. On success the form closes, a toast says what the change set in
 * motion and the page is fetched again, so every panel reads the new values.
 */
export function EditCreatorTrigger({
  creator,
  period,
  periods,
  // A view without locks reads as nothing locked; the server still refuses what is.
  usernameLocks = readUsernameLocks(undefined, readConnections(undefined)),
}: Readonly<{
  creator: CreatorProfile;
  period: CreatorPeriod | null;
  periods: readonly CreatorPeriod[];
  usernameLocks?: UsernameLocks;
}>) {
  const router = useRouter();
  const { show: confirm, toast } = useToast();
  const form = useFormSave(
    (request: CreatorEditRequest) => saveCreatorEdit(creator.id, request),
    (request) => {
      confirm(savedMessage(request, period));
      router.refresh();
    },
    NO_ERRORS,
  );

  return (
    <>
      <Button onClick={form.openForm}>Ubah Data</Button>

      {form.open ? (
        <EditCreatorModal
          creator={creator}
          period={period}
          periods={periods}
          usernameLocks={usernameLocks}
          onClose={form.close}
          onSubmit={form.submit}
          loading={form.saving}
          serverErrors={form.serverErrors}
          formError={form.formError}
        />
      ) : null}

      {toast}
    </>
  );
}
