import { UnprocessableEntityException } from '@nestjs/common';
import { jakartaDay } from '../creators/evergreen.js';
import { GRACE_DAYS } from '../me/task-actions.js';

// The rules around a creator's proposal (PRD 3.10) that need no database: what a rejection
// may say, and the day from which a proposal nobody decided on counts as scheduled anyway.

/** The same cap as a revision note, so every free-text decision reads alike. */
export const MAX_REJECT_REASON_LENGTH = 1000;

export interface RejectReason {
  /** Null when the admin wrote nothing: the reason is optional. */
  reason: string | null;
}

function invalidReason(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data penolakan tidak valid',
    errors: { reason: message },
  });
}

/** Narrows the body of a rejection; an absent or blank reason is no reason, not an error. */
export function checkRejectReason(body: unknown): RejectReason {
  if (body === undefined || body === null) {
    return { reason: null };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw invalidReason('Alasan harus berupa teks');
  }

  const reason = (body as Record<string, unknown>).reason;
  if (reason === undefined || reason === null) {
    return { reason: null };
  }
  if (typeof reason !== 'string') {
    throw invalidReason('Alasan harus berupa teks');
  }

  const trimmed = reason.trim();
  if (trimmed.length > MAX_REJECT_REASON_LENGTH) {
    throw invalidReason(`Alasan maksimal ${MAX_REJECT_REASON_LENGTH} karakter`);
  }
  return { reason: trimmed === '' ? null : trimmed };
}

/**
 * The newest deadline a still-pending proposal can have and count as scheduled: from H-1 on the
 * creator must be able to work on it, approved or not (the lifecycle's "H-1" arrow from Pending
 * to Scheduled). As a Postgres `date` travels as midnight UTC, the cutoff is midnight UTC of
 * the day after today in Jakarta, compared with `deadline <= cutoff`.
 */
export function schedulingCutoff(now: Date): Date {
  const cutoff = new Date(`${jakartaDay(now)}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + GRACE_DAYS);
  return cutoff;
}
