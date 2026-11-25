// Pure rules of "Akhiri Kontrak Lebih Awal" (PBI-37, 37.2): which period may be ended, what the
// form accepts and what the confirmation warns about. The words match the API's own (37.1), so a
// message never changes between the browser's check and the server's. Kept apart from the modal
// so each rule is tested without rendering.

import { EARLY_END_REASON_LABELS } from "./contract-extension";
import type { CreatorPeriod } from "./creator-detail";
import type { EarlyEndReason } from "./creators";
import { shiftDay } from "./deadline-period";
import { formatDate } from "./format";

/** "Bayar Sesuai Kontrak" or "Batalkan Invoice". */
export type InvoiceChoice = "pay" | "cancel";

/** "Pertahankan" or "Hapus" for the periods that have not started (AC 3). */
export type UpcomingChoice = "keep" | "delete";

/** The note is for admins only and holds at most this many characters (AC 2). */
export const NOTE_MAX = 500;

/** The form as the admin fills it; "" is a choice not made yet. */
export interface EarlyEndForm {
  invoice: InvoiceChoice;
  lastDay: string;
  reason: EarlyEndReason | "";
  note: string;
  upcomingPeriods: UpcomingChoice | "";
}

export type EarlyEndErrors = Partial<Record<"lastDay" | "reason" | "note" | "upcomingPeriods", string>>;

/** What POST .../early-end and its preview take. */
export interface EarlyEndRequest {
  invoice: InvoiceChoice;
  lastDay: string;
  reason: EarlyEndReason;
  note: string;
  upcomingPeriods?: UpcomingChoice;
}

/** How the creator's access ends, as the API plans it. */
export type AccessAfterEnd =
  | "closed_now"
  | "after_previous_invoice_paid"
  | "after_invoice_paid"
  | "open_for_upcoming";

/** "Bayar Sesuai Kontrak" is the default (AC 2); nothing else is preset. */
export const EMPTY_EARLY_END_FORM: EarlyEndForm = {
  invoice: "pay",
  lastDay: "",
  reason: "",
  note: "",
  upcomingPeriods: "",
};

/** The confirmation's words for each way access ends. */
export const ACCESS_LABELS: Record<AccessAfterEnd, string> = {
  closed_now: "Langsung ditutup",
  after_previous_invoice_paid: "Ditutup setelah invoice periode lama Paid",
  after_invoice_paid: "Ditutup sehari setelah invoice Paid",
  open_for_upcoming: "Tetap terbuka untuk periode yang dipertahankan",
};

/**
 * The period "Akhiri Kontrak Lebih Awal" ends (AC 1): the one running, while it has not been ended
 * early already. None before it starts, after it ends, or without a period.
 */
export function endablePeriod(periods: readonly CreatorPeriod[]): CreatorPeriod | null {
  return periods.find((period) => period.status === "active" && period.earlyEndReason === null) ?? null;
}

/** The periods that have not started, oldest first: the form asks to keep or delete them (AC 3). */
export function upcomingPeriodsOf(periods: readonly CreatorPeriod[]): CreatorPeriod[] {
  return periods
    .filter((period) => period.status === "upcoming")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * The days a paid end may pick (AC 2): from today, never before the start, to the day before the
 * original end. None on the original end day itself, when only cancelling is left.
 */
export function lastDayWindow(period: CreatorPeriod, today: string): { min: string; max: string } | null {
  const min = today > period.startDate ? today : period.startDate;
  const max = shiftDay(period.endDate, -1);
  return max < min ? null : { min, max };
}

function lastDayError(form: EarlyEndForm, period: CreatorPeriod, today: string): string | undefined {
  // Cancelling fixes the last day to today; there is nothing to pick.
  if (form.invoice === "cancel") return undefined;
  const window = lastDayWindow(period, today);
  if (window === null) return "Tidak ada hari terakhir sebelum kontrak berakhir. Pilih Batalkan Invoice.";
  if (form.lastDay === "") return "Hari terakhir wajib diisi";
  return form.lastDay < window.min || form.lastDay > window.max
    ? `Pilih antara ${formatDate(window.min)} dan ${formatDate(window.max)}`
    : undefined;
}

function noteError(note: string): string | undefined {
  const trimmed = note.trim();
  if (trimmed === "") return "Catatan wajib diisi";
  return trimmed.length > NOTE_MAX ? `Catatan maksimal ${NOTE_MAX} karakter` : undefined;
}

/** Each field's message, in the API's words; empty when the form can go on. */
export function validateEarlyEnd(
  form: EarlyEndForm,
  period: CreatorPeriod,
  today: string,
  upcomingCount: number,
): EarlyEndErrors {
  const errors: EarlyEndErrors = {};
  const lastDay = lastDayError(form, period, today);
  if (lastDay) errors.lastDay = lastDay;
  if (form.reason === "") errors.reason = "Pilih alasan";
  const note = noteError(form.note);
  if (note) errors.note = note;
  if (upcomingCount > 0 && form.upcomingPeriods === "") {
    errors.upcomingPeriods = "Pilih Pertahankan atau Hapus";
  }
  return errors;
}

/** The request for a valid form; a cancel ends the contract today (AC 2). */
export function earlyEndRequest(form: EarlyEndForm, today: string, upcomingCount: number): EarlyEndRequest {
  return {
    invoice: form.invoice,
    lastDay: form.invoice === "cancel" ? today : form.lastDay,
    reason: form.reason as EarlyEndReason,
    note: form.note.trim(),
    ...(upcomingCount > 0 ? { upcomingPeriods: form.upcomingPeriods as UpcomingChoice } : {}),
  };
}

/**
 * The confirmation's warning when the reason and the invoice choice pull apart (AC 4): a violation
 * or fraud that is still paid, or "Lainnya" that is not. Null otherwise.
 */
export function reasonWarning({ reason, invoice }: Pick<EarlyEndForm, "reason" | "invoice">): string | null {
  if (reason === "") return null;
  if (reason !== "other" && invoice === "pay") {
    return `Alasan ${EARLY_END_REASON_LABELS[reason]}, tapi invoice tetap dibayar.`;
  }
  return reason === "other" && invoice === "cancel" ? "Alasan Lainnya, tapi creator tidak dibayar." : null;
}

/** Whether closing the form would throw something away. */
export function isEarlyEndDirty(form: EarlyEndForm): boolean {
  return (
    form.invoice !== "pay" ||
    form.lastDay !== "" ||
    form.reason !== "" ||
    form.note.trim() !== "" ||
    form.upcomingPeriods !== ""
  );
}
