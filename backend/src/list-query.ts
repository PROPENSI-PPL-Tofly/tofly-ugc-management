// The checks every list endpoint runs on its raw query values: one value from a fixed set, a
// multi-select, a search box, a calendar day, a yes/no flag and a deadline range. They live
// here, once, so the admin Content Plan and the creator's Task Saya refuse the same input with
// the same 400 and neither list can drift into accepting what the other refuses (OWASP A03).

import { BadRequestException } from '@nestjs/common';
import { isCalendarDay } from './creators/evergreen.js';
import { MAX_SEARCH_LENGTH } from './creators/filters.js';

/** No filter has a reason to name more values than this, so a longer list is refused. */
export const MAX_FILTER_VALUES = 50;

export function reject(message: string): never {
  throw new BadRequestException(message);
}

export function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return (allowed as readonly unknown[]).includes(value);
}

/** A value that may be sent once only: left out it takes the fallback, a list is refused. */
export function oneOf<T extends string>(
  name: string,
  allowed: readonly T[],
  value: unknown,
  fallback: T,
): T {
  if (value === undefined) {
    return fallback;
  }
  if (!isOneOf(allowed, value)) {
    reject(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

/**
 * A multi-select filter. `?type=a` arrives as text and `?type=a&type=b` as a list, so both are
 * read as a list; anything else the query parser can build (an object, a nested list) fails the
 * element check. Each value is kept once.
 */
export function listOf<T extends string>(
  name: string,
  value: unknown,
  accepts: (element: unknown) => element is T,
  problem: string,
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const elements: unknown[] = Array.isArray(value) ? value : [value];
  if (elements.length > MAX_FILTER_VALUES) {
    reject(`${name} takes at most ${MAX_FILTER_VALUES} values`);
  }
  if (!elements.every(accepts)) {
    reject(problem);
  }
  return [...new Set(elements)];
}

/** The search box: one text value, capped, and nothing at all once trimmed empty. */
export function searchText(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    reject('q must be a single text value');
  }
  if (value.length > MAX_SEARCH_LENGTH) {
    reject(`q must be ${MAX_SEARCH_LENGTH} characters or fewer`);
  }
  return value.trim() || undefined;
}

export function calendarDay(name: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !isCalendarDay(value)) {
    reject(`${name} must be a day written as YYYY-MM-DD`);
  }
  return value;
}

export function overdueOrNot(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== 'true' && value !== 'false') {
    reject('overdue must be true or false');
  }
  return value === 'true';
}

/** Both ends of a deadline period, each a calendar day, the start never after the end. */
export function deadlineRange(
  from: unknown,
  to: unknown,
): { deadlineFrom?: string; deadlineTo?: string } {
  const deadlineFrom = calendarDay('deadlineFrom', from);
  const deadlineTo = calendarDay('deadlineTo', to);
  // ISO days order the same as text and as dates.
  // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent mutants. A day left out is undefined, and undefined is neither above nor below any text, so the two presence checks only satisfy the type checker and no input can tell them apart from `true` or from `||`.
  if (deadlineFrom && deadlineTo && deadlineFrom > deadlineTo) {
    reject('deadlineFrom must not be after deadlineTo');
  }
  return { deadlineFrom, deadlineTo };
}

/** Drops the filters nobody asked for, so the result names only what narrows the list. */
export function withoutUnset<T extends object>(filters: T): T {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  ) as T;
}
