// Pure rules for "Akhiri Kontrak Lebih Awal" (PBI-37): when a contract may be ended early, what the
// form must hold, and what ending it does. The confirmation screen and the write read the same
// plan, so what the admin confirms is exactly what is saved. No Nest wiring or Prisma here, so
// every rule is tested without a database.
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { content_status } from '@prisma/client';
import type { InvoiceLifecycleStatus } from '../invoices/invoice-lifecycle.js';
import { periodHasStarted } from './contract-period.js';
import { jakartaDay, readableDay } from './evergreen.js';

// The words the frontend already reads (PBI-30's warning, creators.ts EARLY_END_REASONS).
export const END_REASONS = ['violation', 'fraud', 'other'] as const;
export type EndReason = (typeof END_REASONS)[number];

/** Each reason as the form's "Alasan" list names it. */
export const END_REASON_LABELS: Readonly<Record<EndReason, string>> = {
  violation: 'Pelanggaran Kontrak',
  fraud: 'Fraud',
  other: 'Lainnya',
};

/** "Bayar Sesuai Kontrak" or "Batalkan Invoice". */
export const INVOICE_CHOICES = ['pay', 'cancel'] as const;
export type InvoiceChoice = (typeof INVOICE_CHOICES)[number];

/** "Pertahankan" or "Hapus" for the periods that have not started (AC 3). */
export const UPCOMING_CHOICES = ['keep', 'delete'] as const;
export type UpcomingChoice = (typeof UPCOMING_CHOICES)[number];

/** The note is for admins only and holds at most this many characters. */
export const NOTE_MAX = 500;

/** The validated form. */
export interface EarlyEndRequest {
  invoice: InvoiceChoice;
  /** YYYY-MM-DD, the contract's new last day. */
  lastDay: string;
  reason: EndReason;
  note: string;
  /** What happens to the periods that have not started; null when there are none. */
  upcomingPeriods: UpcomingChoice | null;
}

/** The contract being ended, as stored. Postgres `date` columns arrive as midnight UTC. */
export interface EndingContract {
  startDate: Date;
  endDate: Date;
  /** Set once the contract was ended early; the end it had before. */
  originalEndDate: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  return isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY));
}

/** A real calendar day written YYYY-MM-DD; 2026-02-30 is not one. */
function isCalendarDay(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_DAY.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    isoDay(new Date(`${value}T00:00:00Z`)) === value
  );
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

/**
 * Only an active contract can be ended early: not before it starts, not after it ends, and not a
 * second time. The second admin of two who end it at once is told it was already ended.
 */
export function assertCanEndEarly(contract: EndingContract, now: Date): void {
  if (contract.originalEndDate !== null) {
    throw conflict('CONTRACT_ALREADY_ENDED', 'Kontrak sudah diakhiri');
  }
  const today = jakartaDay(now);
  if (today < isoDay(contract.startDate)) {
    throw conflict('CONTRACT_NOT_STARTED', 'Kontrak belum dimulai');
  }
  if (today > isoDay(contract.endDate)) {
    throw conflict('CONTRACT_ENDED', 'Kontrak sudah berakhir');
  }
}

/** The last day a paid end may pick: from today (never before the start) to the day before the end. */
function lastDayError(
  lastDay: unknown,
  contract: EndingContract,
  today: string,
): string | undefined {
  if (!isCalendarDay(lastDay)) return 'Hari terakhir wajib diisi';

  const start = isoDay(contract.startDate);
  const earliest = today > start ? today : start;
  const latest = addDays(isoDay(contract.endDate), -1);
  if (latest < earliest) {
    return 'Tidak ada hari terakhir sebelum kontrak berakhir. Pilih Batalkan Invoice.';
  }
  return lastDay < earliest || lastDay > latest
    ? `Pilih antara ${readableDay(earliest)} dan ${readableDay(latest)}`
    : undefined;
}

function noteError(note: unknown): string | undefined {
  if (typeof note !== 'string' || note.trim() === '') return 'Catatan wajib diisi';
  return note.trim().length > NOTE_MAX
    ? `Catatan maksimal ${NOTE_MAX} karakter`
    : undefined;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value);
}

/**
 * Validates the form against the contract, answering anything invalid with one 422 that names
 * every field. Cancelling the invoice locks the last day to today, whatever day was sent. With a
 * period that has not started, keeping or deleting it must be chosen: nothing is preselected.
 */
export function checkEarlyEnd(
  input: unknown,
  contract: EndingContract,
  now: Date,
  upcomingCount = 0,
): EarlyEndRequest {
  // A missing or null body reads as a blank form, not a TypeError.
  const body: Record<string, unknown> = { ...(input as object) };
  const today = jakartaDay(now);
  const errors: Record<string, string> = {};

  if (!isOneOf(INVOICE_CHOICES, body.invoice)) {
    errors.invoice = 'Pilih Invoice Periode Ini';
  } else if (body.invoice === 'pay') {
    const error = lastDayError(body.lastDay, contract, today);
    if (error) errors.lastDay = error;
  }
  if (!isOneOf(END_REASONS, body.reason)) errors.reason = 'Pilih alasan';
  const note = noteError(body.note);
  if (note) errors.note = note;
  if (upcomingCount > 0 && !isOneOf(UPCOMING_CHOICES, body.upcomingPeriods)) {
    errors.upcomingPeriods = 'Pilih Pertahankan atau Hapus';
  }

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data pengakhiran kontrak tidak valid',
      errors,
    });
  }

  const invoice = body.invoice as InvoiceChoice;
  return {
    invoice,
    lastDay: invoice === 'cancel' ? today : (body.lastDay as string),
    reason: body.reason as EndReason,
    note: (body.note as string).trim(),
    upcomingPeriods: upcomingCount > 0 ? (body.upcomingPeriods as UpcomingChoice) : null,
  };
}

/**
 * Whether the reason and the invoice choice pull apart: a violation or fraud that is still paid, or
 * "Lainnya" that is not. The confirmation warns, the admin decides.
 */
export function reasonMismatch({
  reason,
  invoice,
}: Pick<EarlyEndRequest, 'reason' | 'invoice'>): boolean {
  return reason === 'other' ? invoice === 'cancel' : invoice === 'pay';
}

/** One of the creator's contract periods with its invoice status; null when it has no row yet. */
export interface PlanPeriod {
  id: string;
  startDate: Date;
  endDate: Date;
  invoiceStatus: InvoiceLifecycleStatus | null;
}

/** A content item of the contract being ended. */
export interface PlanContent {
  id: string;
  name: string;
  deadline: Date;
  status: content_status;
}

export interface PlannedContent {
  id: string;
  name: string;
  deadline: string;
}

export interface PlannedPeriod {
  contractId: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
}

/**
 * When the creator's access closes, by the shared access rule (PRD 3.1): right away, once an earlier
 * period's invoice is paid, or the day after this invoice is paid; or it stays open for a period
 * that has not started and was kept.
 */
export type AccessAfterEnd =
  | 'closed_now'
  | 'after_previous_invoice_paid'
  | 'after_invoice_paid'
  | 'open_for_upcoming';

export interface EarlyEndPlan {
  lastDay: string;
  originalEndDate: string;
  invoice: InvoiceChoice;
  reasonMismatch: boolean;
  /** The first day the invoice can be finalized; null when it is cancelled. */
  finalizableFrom: string | null;
  /** Content due after the last day and not delivered: closed. */
  closing: PlannedContent[];
  /** Content due by the last day and not delivered yet: still open until then. */
  unfinished: PlannedContent[];
  upcomingPeriods: UpcomingChoice | null;
  /** Periods that have not started, on "Hapus": deleted with their schedule and empty invoice. */
  deletedPeriods: PlannedPeriod[];
  /** Periods that have not started, on "Pertahankan": kept as they are. */
  keptPeriods: PlannedPeriod[];
  access: AccessAfterEnd;
}

function planned(content: PlanContent): PlannedContent {
  return { id: content.id, name: content.name, deadline: isoDay(content.deadline) };
}

/** An invoice the creator still has to see through: anything but paid or cancelled. */
function stillOwed(status: InvoiceLifecycleStatus | null): boolean {
  return status !== 'paid' && status !== 'cancelled';
}

/**
 * What ending this contract does. Delivered content stays as it is; everything else is closed
 * when it is due after the last day. The periods that have not started are deleted or kept as
 * the admin chose; a kept one keeps the creator's access open.
 */
export function planEarlyEnd(
  request: EarlyEndRequest,
  contractId: string,
  periods: readonly PlanPeriod[],
  contents: readonly PlanContent[],
  now: Date,
): EarlyEndPlan {
  const ordered = [...periods].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  const ending = ordered.find((period) => period.id === contractId)!;
  const open = contents.filter((content) => content.status !== 'link_submitted');
  const closes = (content: PlanContent) => isoDay(content.deadline) > request.lastDay;

  const upcoming = ordered.flatMap((period, index) =>
    periodHasStarted(period.startDate, now)
      ? []
      : [
          {
            contractId: period.id,
            periodNumber: index + 1,
            startDate: isoDay(period.startDate),
            endDate: isoDay(period.endDate),
          },
        ],
  );

  const earlierOwed = ordered.some(
    (period) =>
      period.id !== contractId &&
      periodHasStarted(period.startDate, now) &&
      stillOwed(period.invoiceStatus),
  );

  const keep = request.upcomingPeriods === 'keep';
  let access: AccessAfterEnd = 'after_invoice_paid';
  if (keep && upcoming.length > 0) {
    access = 'open_for_upcoming';
  } else if (request.invoice === 'cancel') {
    access = earlierOwed ? 'after_previous_invoice_paid' : 'closed_now';
  }

  return {
    lastDay: request.lastDay,
    originalEndDate: isoDay(ending.endDate),
    invoice: request.invoice,
    reasonMismatch: reasonMismatch(request),
    finalizableFrom:
      request.invoice === 'cancel' ? null : addDays(request.lastDay, 1),
    closing: open.filter(closes).map(planned),
    unfinished: open.filter((content) => !closes(content)).map(planned),
    upcomingPeriods: request.upcomingPeriods,
    deletedPeriods: keep ? [] : upcoming,
    keptPeriods: keep ? upcoming : [],
    access,
  };
}
