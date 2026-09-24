// Pure rules for adding ONE content item to a creator's already-active schedule (PBI-10's
// "Tambah Konten"), re-run on the server since a request can skip the client entirely. Kept
// apart from evergreen.ts, which validates the whole deadline batch at onboarding — this
// judges a single new slot against the quota that batch already used up. The buffer formula,
// the calendar-day check and the "after contract end" message are shared with evergreen.ts
// rather than re-derived here, so onboarding and Tambah Konten can never quietly disagree.
import { DEADLINE_AFTER_CONTRACT_END, earliestDeadline, isCalendarDay } from './evergreen.js';

export type ContentType = 'evergreen' | 'specific';

const CONTENT_TYPES: ContentType[] = ['evergreen', 'specific'];

/** The creator's existing contract, as already stored — not raw request input. */
export interface EvergreenSlotContext {
  contractStart: string;
  contractEnd: string;
  contentQuota: number;
  /** How many Evergreen contents this contract period already has. */
  evergreenScheduledCount: number;
  /** Minimum days between max(contract start, today) and any new deadline (PRD 3.6) — a
   *  global, admin-editable setting, so this is read from the caller, not hardcoded here. */
  bufferDays: number;
}

export type EvergreenSlotErrors = Partial<Record<'contentType' | 'deadline', string>>;

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

  const earliest = earliestDeadline(context.contractStart, today, context.bufferDays);

  if (deadline < earliest) {
    errors.deadline = `Deadline paling cepat ${earliest}`;
  } else if (deadline > context.contractEnd) {
    errors.deadline = DEADLINE_AFTER_CONTRACT_END;
  }

  return errors;
}
