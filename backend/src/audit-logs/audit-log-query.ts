// The raw "Log Aktivitas" query, checked once at the edge (PBI-23, SCRUM-296). Only known categories
// and actions, real ids and real days become specifications (OWASP A05:2025), each filter takes at
// most MAX_FILTER_VALUES values (OWASP A06:2025), and a value that cannot be read answers 400 instead
// of being dropped, which would show more entries than were asked for (OWASP A10:2025).

import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditCategory,
} from '../audit/audit-actions.js';
import { calendarDay, isOneOf, listOf, reject } from '../list-query.js';
import { isUuid } from '../uuid.js';
import {
  AboutCreators,
  ActedBy,
  allOf,
  InCategories,
  OccurredBetween,
  SYSTEM_ACTOR_FILTER,
  WithActions,
  type AuditLogSpec,
} from './audit-log-specs.js';

// SCRUM-295's vocabulary, so the filters accept exactly what AuditLogger can write.
const ACTIONS = Object.keys(AUDIT_ACTIONS) as AuditAction[];
const CATEGORIES = [
  ...new Set(Object.values(AUDIT_ACTIONS).map(({ category }) => category)),
];

export interface AuditLogQuery {
  page: number;
  filter: AuditLogSpec;
}

const isCategory = (value: unknown): value is AuditCategory =>
  isOneOf(CATEGORIES, value);
const isAction = (value: unknown): value is AuditAction =>
  isOneOf(ACTIONS, value);
const isActor = (value: unknown): value is string =>
  value === SYSTEM_ACTOR_FILTER || isUuid(value);

// SCRUM-297 joins a filter's values with commas; a value sent once per item arrives as a list.
function commaSeparated(value: unknown): unknown {
  return typeof value === 'string' ? value.split(',') : value;
}

export function checkAuditLogQuery(
  page: number,
  query: Record<string, unknown>,
): AuditLogQuery {
  if (page < 1) reject('page must be 1 or greater');

  const from = calendarDay('from', query.from);
  const to = calendarDay('to', query.to);
  // ISO days order the same as text and as dates.
  if (from && to && from > to) reject('from must not be after to');

  const actors = listOf(
    'actor',
    commaSeparated(query.actor),
    isActor,
    `actor must be a user id or ${SYSTEM_ACTOR_FILTER}`,
  );
  const categories = listOf(
    'category',
    commaSeparated(query.category),
    isCategory,
    `category must be one of ${CATEGORIES.join(', ')}`,
  );
  const actions = listOf(
    'action',
    commaSeparated(query.action),
    isAction,
    'action must be a Log Aktivitas action',
  );
  const creators = listOf(
    'creator',
    commaSeparated(query.creator),
    isUuid,
    'creator must be a creator id',
  );

  const specs: AuditLogSpec[] = [];
  if (from || to) specs.push(new OccurredBetween(from, to));
  if (actors) specs.push(new ActedBy(actors));
  if (categories) specs.push(new InCategories(categories));
  if (actions) specs.push(new WithActions(actions));
  if (creators) specs.push(new AboutCreators(creators));
  return { page, filter: allOf(specs) };
}
