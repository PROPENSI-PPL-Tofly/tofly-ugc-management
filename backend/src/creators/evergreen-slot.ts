// Pure rules for adding ONE content item to a creator's already-active schedule (PBI-10's
// "Tambah Konten"), re-run on the server since a request can skip the client entirely. Kept
// apart from evergreen.ts, which validates the whole deadline batch at onboarding — this
// judges a single new slot against the quota that batch already used up.

import { DEFAULT_BUFFER_DAYS } from './new-creator.js';

export type ContentType = 'evergreen' | 'specific';

const CONTENT_TYPES: ContentType[] = ['evergreen', 'specific'];

/** The creator's existing contract, as already stored — not raw request input. */
export interface EvergreenSlotContext {
  contractStart: string;
  contractEnd: string;
  contentQuota: number;
  /** How many Evergreen contents this contract period already has. */
  evergreenScheduledCount: number;
}

export type EvergreenSlotErrors = Partial<Record<'contentType' | 'deadline', string>>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` that names a day that exists; 2026-02-30 rolls over, so it fails the round trip. */
function isCalendarDay(value: string): boolean {
  if (!ISO_DAY.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/**
 * `contentType` and `deadline` are the raw Tambah Konten body fields, taken as `unknown`
 * since a request can send anything; `context` is the creator's contract as already stored.
 */
export function checkEvergreenSlot(
  contentType: unknown,
  deadline: unknown,
  context: EvergreenSlotContext,
  today: string,
): EvergreenSlotErrors {
  const errors: EvergreenSlotErrors = {};

  // Specific content is never counted against the Evergreen quota (PRD 3.4/3.7), so this
  // only applies once we know Evergreen itself is actually being added.
  if (!CONTENT_TYPES.includes(contentType as ContentType)) {
    errors.contentType = 'Tipe konten harus evergreen atau specific';
  } else if (
    contentType === 'evergreen' &&
    context.evergreenScheduledCount >= context.contentQuota
  ) {
    errors.contentType = 'Slot Evergreen sudah penuh';
  }

  if (typeof deadline !== 'string' || deadline === '') {
    errors.deadline = 'Tanggal deadline wajib diisi';
    return errors;
  }
  if (!isCalendarDay(deadline)) {
    errors.deadline = 'Format tanggal deadline tidak valid';
    return errors;
  }

  // Same buffer rule the frontend's content-schedule.ts applies (PRD 3.6): on/after
  // max(contract start, today) + buffer, and on/before the contract end date. ISO days
  // compare correctly as strings (same fact evergreen.ts's checkSchedule already relies on).
  const from = context.contractStart > today ? context.contractStart : today;
  const earliest = addDays(from, DEFAULT_BUFFER_DAYS);

  if (deadline < earliest) {
    errors.deadline = `Deadline paling cepat ${earliest}`;
  } else if (deadline > context.contractEnd) {
    errors.deadline = 'Deadline tidak boleh setelah akhir kontrak';
  }

  return errors;
}
