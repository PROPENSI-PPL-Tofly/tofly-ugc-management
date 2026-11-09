import type { social_platform } from '@prisma/client';
import type {
  ContentChanges,
  ContentEvent,
  DetailEventType,
  MetricChange,
} from './content-detail.js';
import { isSocialPlatform } from './link-rules.js';

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
const STEP_FOR: Record<
  string,
  { type: DetailEventType; payload: (data: Data) => ContentEvent['payload'] }
> = {
  Scheduled: { type: 'scheduled', payload: () => undefined },
  'Proposal Approved': { type: 'proposal_approved', payload: () => undefined },
  'Auto Scheduled': { type: 'auto_scheduled', payload: () => undefined },
  'Draft Approved': { type: 'draft_approved', payload: () => undefined },
  'Draft Submitted': {
    type: 'draft_submitted',
    payload: (data) =>
      details({
        version: data.number('version'),
        link: data.text('link'),
        note: data.text('note'),
      }),
  },
  'Revision Requested': {
    type: 'revision_requested',
    payload: (data) => details({ note: data.text('revision_note') }),
  },
  'Link Submitted': {
    type: 'link_submitted',
    payload: (data) =>
      details({ link: data.text('link'), platform: data.platform('platform') }),
  },
  // A replaced link is still a link step (PBI-38 AC 9); `replaced` says it took another's place.
  'Link Replaced': {
    type: 'link_submitted',
    payload: (data) =>
      details({
        link: data.text('link'),
        platform: data.platform('platform'),
        replaced: true,
      }),
  },
  // Numbers an admin typed in, with what moved (PBI-27 AC 16).
  'Performance Entered': {
    type: 'performance_entered',
    payload: (data) =>
      details({
        platform: data.platform('platform'),
        changes: data.metricChanges(),
      }),
  },
  // The platform's numbers took the place of typed ones (PBI-27 AC 17).
  'Performance Replaced': {
    type: 'performance_replaced',
    payload: (data) =>
      details({
        platform: data.platform('platform'),
        changes: data.metricChanges(),
      }),
  },
  'Creator Comment': {
    type: 'creator_comment',
    payload: (data) => details({ note: data.text('comment') }),
  },
  // An admin's edit of a scheduled content (PBI-25 AC 4): each changed field, old and new.
  'Content Updated': {
    type: 'content_updated',
    payload: (data) => details({ changes: data.changes('changes') }),
  },
};

const EDITED_FIELDS = ['deadline', 'brief', 'name'] as const;

/** Typed reads of a stored jsonb object; a field of the wrong type reads as absent. */
interface Data {
  number(key: string): number | undefined;
  text(key: string): string | undefined;
  /** A platform the app knows; any other stored value reads as absent. */
  platform(key: string): social_platform | undefined;
  /** The numbers that moved between `before` and `after`; absent when no values were stored. */
  metricChanges(): MetricChange[] | undefined;
  /** An edit's changes: only the fields an edit can touch, with text on both sides. */
  changes(key: string): ContentChanges | undefined;
}

const METRIC_NAMES: readonly MetricChange['metric'][] = [
  'views',
  'likes',
  'comments',
  'shares',
];

function metricOf(values: unknown, metric: string): number | null {
  const value = (values as Record<string, unknown>)[metric];
  return typeof value === 'number' ? value : null;
}

function isObject(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

function objectOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function changesOf(value: unknown): ContentChanges | undefined {
  if (objectOf(value) !== value) {
    return undefined;
  }
  const changes: ContentChanges = {};
  for (const field of EDITED_FIELDS) {
    const { from, to } = objectOf(objectOf(value)[field]);
    if (typeof from === 'string' && typeof to === 'string') {
      changes[field] = { from, to };
    }
  }
  return changes;
}

function dataOf(value: unknown): Data {
  const fields = objectOf(value);
  return {
    metricChanges: () => {
      const { before, after } = fields;
      if (!isObject(before) || !isObject(after)) {
        return undefined;
      }
      return METRIC_NAMES.map((metric) => ({
        metric,
        before: metricOf(before, metric),
        after: metricOf(after, metric),
      })).filter((change) => change.before !== change.after);
    },
    changes: (key) => changesOf(fields[key]),
    number: (key) =>
      typeof fields[key] === 'number' ? fields[key] : undefined,
    // Blank text says nothing, as blank notes are left out everywhere else.
    platform: (key) =>
      isSocialPlatform(fields[key]) ? fields[key] : undefined,
    text: (key) => {
      const field = fields[key];
      return typeof field === 'string' && field.trim() !== ''
        ? field
        : undefined;
    },
  };
}

/** Drops the absent fields, so the payload holds only what was stored. */
function details(
  fields: NonNullable<ContentEvent['payload']>,
): NonNullable<ContentEvent['payload']> {
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
    const role =
      row.actor_role === 'admin' || row.actor_role === 'system'
        ? row.actor_role
        : 'creator';
    const payload = step.payload(dataOf(row.event_data));
    return [
      {
        id: row.id,
        type: step.type,
        at: row.occurred_at.toISOString(),
        actor: { name: role === 'creator' ? row.actor_name : null, role },
        ...(payload && { payload }),
      },
    ];
  });
}
