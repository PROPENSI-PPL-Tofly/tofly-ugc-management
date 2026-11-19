"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFieldErrors } from "@/components/creators/use-field-errors";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import {
  ALERT,
  ContractTermsFields,
  DeadlineSchedule,
  useDeadlineAllocation,
  type TermField,
} from "@/components/creators/contract-terms-fields";
import {
  earlyEndWarning,
  extensionDefaults,
  validateContractExtension,
  type PreviousPeriod,
} from "@/lib/contract-extension";
import type { ContractRequest } from "@/lib/contracts";
import {
  CONTRACT_TYPE_LABELS,
  localCalendarDay,
  scheduleReady,
  type ContractTermsInput,
  type ContractType,
  type CreatorFormErrors,
} from "@/lib/creator-form";
import { NO_PICKS } from "@/lib/deadline-allocation";
import { formatContractWindow, formatRupiah } from "@/lib/format";

const NO_ERRORS: CreatorFormErrors = {};

/**
 * "Perpanjang Kontrak" (PBI-30, 30.3): a new period for a creator who already has one, with the
 * same terms and Evergreen calendar as Tambah Creator but without who the creator is, which does
 * not change. Opens on the day after the current end and the previous rate (AC 2), and saves
 * only after a confirmation that sums the new period up (AC 3).
 */
export function ExtendContractModal({
  creatorName,
  previous,
  onClose,
  onSubmit,
  loading = false,
  serverErrors = NO_ERRORS,
  formError,
}: {
  creatorName: string;
  /** The creator's newest period, which the new one follows. */
  previous: PreviousPeriod;
  onClose: () => void;
  onSubmit: (request: ContractRequest) => void;
  loading?: boolean;
  /** The server's message per field from the last rejected save. */
  serverErrors?: CreatorFormErrors;
  /** A save failure that belongs to no single field. */
  formError?: string;
}) {
  const today = localCalendarDay(new Date());
  const [initial] = useState(() => extensionDefaults(previous, today));
  const [terms, setTerms] = useState<ContractTermsInput>(initial);
  const [confirming, setConfirming] = useState(false);

  const { allocation, picks, setPicks } = useDeadlineAllocation(terms, today);
  const remaining = allocation?.remaining ?? 0;
  const liveErrors = validateContractExtension(terms, previous.endDate);
  const isValid = Object.keys(liveErrors).length === 0;
  const { markTouched, markEdited, fieldError } = useFieldErrors<keyof CreatorFormErrors>(
    liveErrors,
    serverErrors,
  );
  const showSchedule = allocation !== null && scheduleReady(liveErrors);

  const isDirty =
    picks !== NO_PICKS ||
    (Object.keys(initial) as TermField[]).some((field) => terms[field] !== initial[field]);
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty,
    onDiscard: onClose,
    title: "Batalkan perpanjangan kontrak?",
  });

  function patch(changes: Partial<ContractTermsInput>) {
    setTerms((prev) => ({ ...prev, ...changes }));
    markEdited(Object.keys(changes) as TermField[]);
  }

  // Disabled until valid with every content placed, so the terms are complete by now.
  const request: ContractRequest = {
    ...terms,
    fixedRate: terms.fixedRate ?? 0,
    contractType: terms.contractType as ContractType,
    deadlines: allocation?.deadlines ?? [],
  };

  return (
    <>
      <Modal
        title={`Perpanjang Kontrak — ${creatorName}`}
        onClose={requestClose}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose}>
              Batal
            </Button>
            <Button
              variant="accent"
              onClick={() => setConfirming(true)}
              disabled={loading || !isValid || remaining > 0}
            >
              Perpanjang Kontrak
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-muted">Kolom bertanda * wajib diisi.</p>

        <fieldset className="mb-4 border-t border-rule pt-3">
          <legend className="pr-2 text-[13px] font-bold text-ink">Periode Baru</legend>
          <ContractTermsFields
            terms={terms}
            today={today}
            fieldError={fieldError}
            onChange={patch}
            onDateChange={(field, value) => {
              patch({ [field]: value });
              markTouched(field);
            }}
            onBlur={markTouched}
            fixedRateHint="Rate tetap untuk periode baru ini, terisi dari periode sebelumnya. Tidak ada biaya default untuk tiap konten."
          />
        </fieldset>

        <DeadlineSchedule
          terms={terms}
          today={today}
          allocation={allocation}
          show={showSchedule}
          setPicks={setPicks}
          error={serverErrors.deadlines}
        />

        {formError ? (
          <p role="alert" className={`mt-3 ${ALERT}`}>
            {formError}
          </p>
        ) : null}
      </Modal>

      {confirming ? (
        <ConfirmDialog
          title="Perpanjang kontrak?"
          message="Kontrak dan invoice periode sebelumnya tidak berubah. Deadline Evergreen periode baru ter-generate."
          warning={earlyEndWarning(previous.earlyEndReason) ?? undefined}
          details={[
            ["Creator", creatorName],
            ["Periode", formatContractWindow(request.contractStart, request.contractEnd)],
            ["Jenis Kontrak", CONTRACT_TYPE_LABELS[request.contractType]],
            ["Konten", `${request.quota} konten, tiap ${request.interval} hari`],
            ["Fixed Rate", formatRupiah(request.fixedRate)],
          ]}
          confirmLabel="Perpanjang"
          cancelLabel="Batal"
          confirmVariant="accent"
          onConfirm={() => {
            setConfirming(false);
            onSubmit(request);
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      {confirmDialog}
    </>
  );
}
