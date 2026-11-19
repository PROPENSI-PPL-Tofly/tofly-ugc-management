// Pure rules of "Perpanjang Kontrak" (PBI-30, 30.3): when a new period may be added, what the
// form opens with and what it accepts. Kept apart from the modal so each rule is testable
// without rendering, and so the edit of a "Belum Dimulai" period reads the same rules.

import { validateCreatorForm, type CreatorFormErrors, type CreatorFormInput } from "./creator-form";
import type { CreatorPeriod } from "./creator-detail";
import { shiftDay } from "./deadline-period";
import { formatDate } from "./format";

/** Why a contract was ended early (PBI-37's three reason types). */
export type EarlyEndReason = "violation" | "fraud" | "other";

export const EARLY_END_REASON_LABELS: Record<EarlyEndReason, string> = {
  violation: "Pelanggaran Kontrak",
  fraud: "Fraud",
  other: "Lainnya",
};

/** The terms a new period is given: Tambah Creator's contract half, without who the creator is. */
export type ContractTermsInput = Pick<
  CreatorFormInput,
  "contractStart" | "contractEnd" | "interval" | "quota" | "fixedRate" | "contractType"
>;

/** What the form reads of the period it extends. */
export type PreviousPeriod = Pick<CreatorPeriod, "status" | "type" | "endDate" | "daysBetween"> & {
  fixedRate: number;
  earlyEndReason: EarlyEndReason | null;
};

/**
 * Whether "Perpanjang Kontrak" is offered: while the newest period runs and any time after it
 * ended, an early end included (AC 1). Not while a next period is already waiting to start.
 */
export function canExtendContract(periods: readonly Pick<PreviousPeriod, "status">[]): boolean {
  const newest = periods[0];
  return newest !== undefined && newest.status !== "upcoming";
}

/**
 * The form's opening values (AC 2): the day after the current end, never before today, and the
 * previous period's rate and interval. The quota and the end are the admin's to choose.
 */
export function extensionDefaults(previous: PreviousPeriod, today: string): ContractTermsInput {
  const dayAfter = shiftDay(previous.endDate, 1);

  return {
    contractStart: dayAfter > today ? dayAfter : today,
    contractEnd: "",
    interval: previous.daysBetween,
    quota: 0,
    fixedRate: previous.fixedRate,
    contractType: "regular",
  };
}

const TERM_FIELDS = [
  "contractStart",
  "contractEnd",
  "interval",
  "quota",
  "fixedRate",
  "contractType",
] as const;

/**
 * Tambah Creator's contract rules (AC 2), plus the one only a renewal has: the new period starts
 * after the previous one ends, so two periods never overlap.
 */
export function validateContractExtension(
  input: ContractTermsInput,
  previousEnd: string,
  today: Date = new Date(),
): CreatorFormErrors {
  const all = validateCreatorForm(
    { ...input, name: "x", email: "x@x.co", instagramUsername: "", tiktokUsername: "" },
    today,
  );
  const errors: CreatorFormErrors = {};
  for (const field of TERM_FIELDS) {
    if (all[field]) errors[field] = all[field];
  }

  if (!errors.contractStart && input.contractStart !== "" && input.contractStart <= previousEnd) {
    errors.contractStart = `Tanggal mulai harus setelah akhir kontrak sebelumnya (${formatDate(previousEnd)})`;
  }

  return errors;
}

/** The confirmation's warning when the previous contract was ended for cause (AC 3). */
export function earlyEndWarning(reason: EarlyEndReason | null): string | null {
  if (reason !== "violation" && reason !== "fraud") return null;
  return `Kontrak sebelumnya diakhiri lebih awal karena ${EARLY_END_REASON_LABELS[reason]}.`;
}
