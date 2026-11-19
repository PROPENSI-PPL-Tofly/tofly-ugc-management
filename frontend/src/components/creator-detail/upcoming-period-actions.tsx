"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useFormSave } from "@/components/creators/use-form-save";
import { editablePeriod } from "@/lib/contract-extension";
import { deleteContract, updateContract, type ContractRequest } from "@/lib/contracts";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { CreatorFormErrors } from "@/lib/creator-form";
import { formatContractWindow } from "@/lib/format";
import { ExtendContractModal } from "./extend-contract-modal";

const NO_ERRORS: CreatorFormErrors = {};

/**
 * "Ubah Periode" and "Hapus Periode" on the Periode Kontrak panel (PBI-30 AC 8-9), offered only
 * while the newest renewal is "Belum Dimulai". A change opens the renewal's own form and has its
 * Evergreen schedule generated again; a delete asks first, naming what goes with the period.
 * The backend logs the delete in Log Aktivitas.
 */
export function UpcomingPeriodActions({
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
  const { show: notify, toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editable = editablePeriod(periods);
  const contractId = editable?.period.contractId ?? "";
  const label = `Periode ${editable?.period.periodNumber ?? ""}`;

  const form = useFormSave(
    (request: ContractRequest) => updateContract(creatorId, contractId, request),
    (request) => {
      notify(`${label} diperbarui. ${request.deadlines.length} deadline Evergreen di-generate ulang.`);
      router.refresh();
    },
    NO_ERRORS,
  );

  if (editable === null) return toast;
  const { period, previous } = editable;

  async function remove() {
    setAsking(false);
    setDeleting(true);
    const result = await deleteContract(creatorId, contractId);
    setDeleting(false);

    if (result.ok) {
      notify(`${label} dihapus.`);
      router.refresh();
      return;
    }
    notify(result.message);
  }

  return (
    <>
      <span className="flex flex-wrap gap-2">
        <Button onClick={form.openForm}>Ubah Periode</Button>
        <Button variant="danger-outline" onClick={() => setAsking(true)} disabled={deleting}>
          Hapus Periode
        </Button>
      </span>

      {form.open ? (
        <ExtendContractModal
          creatorName={creatorName}
          previous={previous}
          editing={period}
          onClose={form.close}
          onSubmit={form.submit}
          loading={form.saving}
          serverErrors={form.serverErrors}
          formError={form.formError}
        />
      ) : null}

      {asking ? (
        <ConfirmDialog
          title={`Hapus ${label}?`}
          message="Slot Evergreen dan invoice kosong periode ini ikut terhapus. Penghapusan tercatat di Log Aktivitas."
          details={[
            ["Creator", creatorName],
            ["Periode", formatContractWindow(period.startDate, period.endDate)],
          ]}
          confirmLabel="Hapus"
          cancelLabel="Batal"
          onConfirm={remove}
          onCancel={() => setAsking(false)}
        />
      ) : null}

      {toast}
    </>
  );
}
