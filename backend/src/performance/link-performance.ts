import { UnprocessableEntityException } from '@nestjs/common';

// The rules every reader and writer of a link's performance numbers shares (PBI-27, 27.1),
// without Prisma or a clock, so the manual input route, Content Detail and the sync agree.

/** The four numbers of one link. Null is no data yet, never 0 (AC 1, 2). */
export interface LinkMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export const METRIC_NAMES = ['views', 'likes', 'comments', 'shares'] as const;

/** The highest number an admin may type (AC 15). */
export const MAX_METRIC = 999_999_999;

/** One state per link (AC 3), as content_links.data_state stores it. */
export type LinkDataState =
  | 'waiting'
  | 'not_connected'
  | 'synced'
  | 'not_found'
  | 'sync_failed'
  | 'manual';

/**
 * States in which the platform cannot give the numbers, so an admin may type them (AC 14). A
 * link already filled by hand stays open, so a typo can be corrected.
 */
const MANUAL_STATES: ReadonlySet<LinkDataState> = new Set([
  'not_connected',
  'not_found',
  'sync_failed',
  'manual',
]);

/**
 * What a link's performance columns go back to when another video takes its place (PBI-38
 * AC 9): the old video's numbers never count for the new one.
 */
export const CLEARED_PERFORMANCE = Object.freeze({
  views: null,
  likes: null,
  comments: null,
  shares: null,
  data_state: 'waiting',
  last_synced_at: null,
  manual_by: null,
  manual_at: null,
} as const);

const FIELD_MESSAGE = 'Isi bilangan bulat 0 sampai 999.999.999';

function isEmptyField(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

/** A whole number in range, from a JSON number or digits typed into a form field; else null. */
function wholeNumber(value: unknown): number | null {
  const number =
    typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  return typeof number === 'number' &&
    Number.isSafeInteger(number) &&
    number >= 0 &&
    number <= MAX_METRIC
    ? number
    : null;
}

/**
 * `{ views?, likes?, comments?, shares? }` as an admin typed them (AC 15). Every refused field
 * is answered in one 422 keyed by its name; with nothing filled the answer is on `metrics`.
 */
export function checkManualPerformance(body: unknown): LinkMetrics {
  const fields =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const metrics: LinkMetrics = {
    views: null,
    likes: null,
    comments: null,
    shares: null,
  };
  const errors: Record<string, string> = {};

  for (const name of METRIC_NAMES) {
    const value = fields[name];
    if (isEmptyField(value)) continue;
    const number = wholeNumber(value);
    if (number === null) errors[name] = FIELD_MESSAGE;
    else metrics[name] = number;
  }

  if (
    Object.keys(errors).length === 0 &&
    METRIC_NAMES.every((name) => metrics[name] === null)
  ) {
    errors.metrics = 'Isi minimal satu angka';
  }
  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Angka performa tidak valid',
      errors,
    });
  }
  return metrics;
}

/**
 * The state a link reads as. Until a sync reaches it a link is waiting, but a creator who has
 * not connected that platform's account will never be synced, so it reads as not connected
 * straight away and an admin can fill it in (AC 3, 14).
 */
export function effectiveState(
  stored: LinkDataState,
  accountConnected: boolean,
): LinkDataState {
  return stored === 'waiting' && !accountConnected ? 'not_connected' : stored;
}

export function canEnterManually(state: LinkDataState): boolean {
  return MANUAL_STATES.has(state);
}
