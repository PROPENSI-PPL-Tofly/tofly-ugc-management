"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useFormSave } from "@/components/creators/use-form-save";
import { canExtendContract } from "@/lib/contract-extension";
import { createContract, type ContractRequest } from "@/lib/contracts";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { CreatorFormErrors } from "@/lib/creator-form";
import { formatDate } from "@/lib/format";
import { ExtendContractModal } from "./extend-contract-modal";

const NO_ERRORS: CreatorFormErrors = {};

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
  const { show: confirm, toast } = useToast();
  const form = useFormSave(
    (request: ContractRequest) => createContract(creatorId, request),
    (request) => {
      confirm(
        `Kontrak ${creatorName} diperpanjang sampai ${formatDate(request.contractEnd)}. ${request.deadlines.length} deadline Evergreen baru ter-generate.`,
      );
      router.refresh();
    },
    NO_ERRORS,
  );

  const current = periods[0];
  if (!current || !canExtendContract(periods)) return toast;

  return (
    <>
      <Button onClick={form.openForm}>
        + Perpanjang Kontrak
      </Button>

      {form.open ? (
        <ExtendContractModal
          creatorName={creatorName}
          previous={current}
          periodNumber={current.periodNumber + 1}
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
