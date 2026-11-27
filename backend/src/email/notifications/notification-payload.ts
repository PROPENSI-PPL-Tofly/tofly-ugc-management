import { isCalendarDay } from '../../creators/evergreen.js';
import type { NotificationTemplate } from './notification-templates.js';

// What 11.4 reads from an email's logged data (11.1 keeps it as JSON on the email_log row, so the
// 08:00 run can render it again). Each template names the fields it takes; only those reach the
// copy, checked one by one, so a field a trigger adds by mistake — a reason, a note, a token —
// never reaches an email (AC 10), and a missing one fails the email instead of printing
// "undefined" (it is logged failed and retried, AC 9).

/** The logged data does not hold what the template needs. */
export class InvalidNotificationPayload extends Error {}

type Kind =
  /** A text with something in it. */
  | 'text'
  /** A text, or nothing: missing, null and blank all read as null. */
  | 'optionalText'
  /** A `YYYY-MM-DD` day that exists. */
  | 'day'
  | 'optionalDay'
  /** The early-end invoice outcome (PBI-37). */
  | 'invoiceOutcome'
  /** The creator an Admin email is about; a creator gone from the contract reads "Creator". */
  | 'creatorName';

const CONTENT = { contentId: 'text', contentName: 'text' } as const;

/** The fields each template takes from its trigger (creator-emails.ts, admin-emails.ts, 11.3). */
const FIELDS: Record<NotificationTemplate, Readonly<Record<string, Kind>>> = {
  account_ready: {},
  content_scheduled: { ...CONTENT, deadline: 'day' },
  revision_requested: CONTENT,
  follow_up_added: CONTENT,
  draft_approved: CONTENT,
  proposal_approved: CONTENT,
  proposal_scheduled: CONTENT,
  proposal_rejected: { contentName: 'text', reason: 'optionalText' },
  content_rescheduled: { ...CONTENT, deadline: 'day' },
  content_deleted: { contentName: 'text', deadline: 'day' },
  invoice_finalized: { contractId: 'text' },
  payment_proof_uploaded: { contractId: 'text' },
  invoice_paid: { contractId: 'text', accessClosesOn: 'optionalDay' },
  period_added: { contractId: 'text', startDate: 'day', endDate: 'day' },
  contract_ended_early: { lastDay: 'day', invoice: 'invoiceOutcome' },
  deadline_reminder: { ...CONTENT, deadline: 'day' },
  draft_submitted: { ...CONTENT, creatorName: 'creatorName' },
  proposal_submitted: {
    ...CONTENT,
    deadline: 'day',
    creatorName: 'creatorName',
  },
  invoice_acknowledged: { contractId: 'text', creatorName: 'creatorName' },
};

/** The greeting name every email takes, as 11.1's helper adds it. */
const RECIPIENT = { recipientName: 'optionalText' } as const;

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** One field read as its kind; undefined when it cannot be. */
function read(kind: Kind, value: unknown): unknown {
  switch (kind) {
    case 'text':
      return isText(value) ? value : undefined;
    case 'optionalText':
      if (value === undefined || value === null) return null;
      return typeof value === 'string'
        ? value.trim() === ''
          ? null
          : value
        : undefined;
    case 'day':
      return typeof value === 'string' && isCalendarDay(value)
        ? value
        : undefined;
    case 'optionalDay':
      return value === undefined || value === null ? null : read('day', value);
    case 'invoiceOutcome':
      return value === 'paid' || value === 'cancelled' ? value : undefined;
    case 'creatorName':
      if (typeof value !== 'string') return undefined;
      return value.trim() || 'Creator';
  }
}

/**
 * The template's own fields of the logged data, each checked; throws InvalidNotificationPayload
 * naming the field (never its value: it may be a name or an address, OWASP A09).
 */
export function readPayload(
  template: NotificationTemplate,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const fields = { ...FIELDS[template], ...RECIPIENT };
  const data: Record<string, unknown> = {};
  for (const [field, kind] of Object.entries(fields)) {
    const value = read(kind, payload[field]);
    if (value === undefined) {
      throw new InvalidNotificationPayload(
        `Email ${template} has no valid ${field}`,
      );
    }
    data[field] = value;
  }
  return data;
}
