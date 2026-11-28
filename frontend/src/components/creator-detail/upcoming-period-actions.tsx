"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useFormSave } from "@/components/creators/use-form-save";
import { editablePeriod } from "@/lib/contract-extension";
import {
  deleteContract,
  fetchPeriodSpecifics,
  updateContract,
  type ContractRequest,
  type PeriodSpecifics,
} from "@/lib/contracts";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { CreatorFormErrors } from "@/lib/creator-form";
import { formatContractWindow } from "@/lib/format";
import { ExtendContractModal } from "./extend-contract-modal";

const NO_ERRORS: CreatorFormErrors = {};

/** How many Specific names the delete dialog lists before it only counts. */
const NAMED_SPECIFICS = 5;

/**
 * What the delete dialog says goes with the period: the Specific content when there is some, and
 * a "kalau ada" while the list is still loading or could not be read.
 */
function deleteMessage(specifics: PeriodSpecifics | null | undefined): string {
  if (specifics === undefined || specifics === null) {
    return `Slot Evergreen, invoice kosong dan konten Specific periode ini (kalau ada) ikut terhapus.`;
  }
  if (specifics.total === 0) return `Slot Evergreen dan invoice kosong periode ini ikut terhapus.`;
  return `Slot Evergreen, invoice kosong dan ${specifics.total} konten Specific periode ini ikut terhapus.`;
}

function specificNames({ names, total }: PeriodSpecifics): string {
  const shown = names.slice(0, NAMED_SPECIFICS);
  const rest = total - shown.length;
  return rest > 0 ? `${shown.join(", ")} dan ${rest} lainnya` : shown.join(", ");
}

/**
 * "Ubah Periode" and "Hapus Periode" on the Periode Kontrak panel (PBI-30 AC 8-9), offered only
 * while the newest renewal is "Belum Dimulai". A change opens the renewal's own form and has its
 * Evergreen schedule generated again; a delete asks first, naming what goes with the period,
 * the Specific content the admin added included. Offered only while that period is the open one,
 * so the buttons above the switcher always act on the period it shows.
 */
export function UpcomingPeriodActions({
  creatorId,
  creatorName,
  periods,
  selected,
}: Readonly<{
  creatorId: string;
  creatorName: string;
  /** Newest first, as the page's view carries them. */
  periods: readonly CreatorPeriod[];
  /** The period the switcher has open. */
  selected: CreatorPeriod | null;
}>) {
  const router = useRouter();
  const { show: notify, toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // undefined while the list is loading, null when it could not be read.
  const [specifics, setSpecifics] = useState<PeriodSpecifics | null | undefined>(undefined);
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

  if (editable === null || editable.period.contractId !== selected?.contractId) return toast;
  const { period, previous } = editable;

  function askDelete() {
    setSpecifics(undefined);
    setAsking(true);
    void fetchPeriodSpecifics(contractId).then(setSpecifics);
  }

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
        <Button variant="danger-outline" onClick={askDelete} disabled={deleting}>
          Hapus Periode
        </Button>
      </span>

      {form.open ? (
        <ExtendContractModal
          creatorName={creatorName}
          previous={previous}
          periodNumber={period.periodNumber}
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
          message={deleteMessage(specifics)}
          details={[
            ["Creator", creatorName],
            ["Periode", formatContractWindow(period.startDate, period.endDate)],
            ...(specifics && specifics.total > 0
              ? [["Konten Specific", specificNames(specifics)] as [string, string]]
              : []),
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
