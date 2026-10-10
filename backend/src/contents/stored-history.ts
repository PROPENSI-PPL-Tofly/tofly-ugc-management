import type { ContentEvent, DetailEventType } from './content-detail.js';

// The stored history (content_events) read back into the steps the Content Detail panel shows.
// The table speaks the writers' vocabulary ("Draft Submitted", revision_note); the panel's
// contract is the one buildEvents already answered, so the endpoint's shape does not change.

/** One row of content_events, as content-detail.service selects it. */
export interface StoredEventRow {
  id: string;
  event_type: string;
  actor_name: string;
  actor_role: string;
  occurred_at: Date;
  event_data: unknown;
}

// Each stored kind and the panel step it becomes, with the details that step carries. A kind
// missing here is skipped rather than guessed at.
const STEP_FOR: Record<string, { type: DetailEventType; payload: (data: Data) => ContentEvent['payload'] }> = {
  Scheduled: { type: 'scheduled', payload: () => undefined },
  'Proposal Approved': { type: 'proposal_approved', payload: () => undefined },
  'Draft Approved': { type: 'draft_approved', payload: () => undefined },
  'Draft Submitted': {
    type: 'draft_submitted',
    payload: (data) => details({ version: data.number('version'), link: data.text('link'), note: data.text('note') }),
  },
  'Revision Requested': {
    type: 'revision_requested',
    payload: (data) => details({ note: data.text('revision_note') }),
  },
  'Link Submitted': { type: 'link_submitted', payload: (data) => details({ link: data.text('link') }) },
  'Creator Comment': { type: 'creator_comment', payload: (data) => details({ note: data.text('comment') }) },
};

/** Typed reads of a stored jsonb object; a field of the wrong type reads as absent. */
interface Data {
  number(key: string): number | undefined;
  text(key: string): string | undefined;
}

function dataOf(value: unknown): Data {
  const fields =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    number: (key) => (typeof fields[key] === 'number' ? fields[key] : undefined),
    // Blank text says nothing, as blank notes are left out everywhere else.
    text: (key) => {
      const field = fields[key];
      return typeof field === 'string' && field.trim() !== '' ? field : undefined;
    },
  };
}

/** Drops the absent fields, so the payload holds only what was stored. */
function details(fields: NonNullable<ContentEvent['payload']>): NonNullable<ContentEvent['payload']> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as NonNullable<ContentEvent['payload']>;
}

/**
 * The stored rows as panel steps, in the order they came (newest first). An admin is only ever
 * sent as "an admin": whatever name an admin event stored stays on the server (OWASP A01).
 */
export function fromStoredHistory(rows: StoredEventRow[]): ContentEvent[] {
  return rows.flatMap((row) => {
    const step = STEP_FOR[row.event_type];
    if (!step) {
      return [];
    }
    const role = row.actor_role === 'admin' ? 'admin' : 'creator';
    const payload = step.payload(dataOf(row.event_data));
    return [
      {
        id: row.id,
        type: step.type,
        at: row.occurred_at.toISOString(),
        actor: { name: role === 'admin' ? null : row.actor_name, role },
        ...(payload && { payload }),
      },
    ];
  });
}
