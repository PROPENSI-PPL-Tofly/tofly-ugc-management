"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { canExtendContract } from "@/lib/contract-extension";
import { createContract, type ContractRequest } from "@/lib/contracts";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { CreatorFormErrors } from "@/lib/creator-form";
import { formatDate } from "@/lib/format";
import { ExtendContractModal } from "./extend-contract-modal";

interface SaveFailure {
  message?: string;
  errors: CreatorFormErrors;
}

const NO_FAILURE: SaveFailure = { errors: {} };

/**
 * "+ Perpanjang Kontrak" on Creator Detail's Periode Kontrak panel (PBI-30 AC 1): offered while
 * the newest period runs or after it ended, never while a next one waits to start. Saving posts
 * the new period; on success the form closes, a toast confirms it and the page is fetched again,
 * so the new period's tab appears without a full reload.
 */
export function ExtendContractTrigger({
  creatorId,
  creatorName,
  periods,
}: Readonly<{
  creatorId: string;
  creatorName: string;
  /** Newest first, as the page's view carries them. */
  periods: readonly CreatorPeriod[];
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure>(NO_FAILURE);
  const { show: confirm, toast } = useToast();

  // Stable, so the modal's discard guard is not rebuilt on every render.
  const close = useCallback(() => {
    setOpen(false);
    setFailure(NO_FAILURE);
  }, []);

  const current = periods[0];
  if (!current || !canExtendContract(periods)) return toast;

  async function save(request: ContractRequest) {
    setSaving(true);
    const result = await createContract(creatorId, request);
    setSaving(false);

    if (result.ok) {
      close();
      confirm(
        `Kontrak ${creatorName} diperpanjang sampai ${formatDate(request.contractEnd)}. ${request.deadlines.length} deadline Evergreen baru ter-generate.`,
      );
      router.refresh();
      return;
    }

    // Field messages are shown under their inputs; the general message only when none are.
    const hasFieldErrors = Object.keys(result.errors).length > 0;
    setFailure({ errors: result.errors, message: hasFieldErrors ? undefined : result.message });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        + Perpanjang Kontrak
      </Button>

      {open ? (
        <ExtendContractModal
          creatorName={creatorName}
          previous={current}
          onClose={close}
          onSubmit={save}
          loading={saving}
          serverErrors={failure.errors}
          formError={failure.message}
        />
      ) : null}

      {toast}
    </>
  );
}
