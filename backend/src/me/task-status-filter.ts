// The status filter on Task Saya (PRD 3.16), in the creator's vocabulary. A creator does not
// tell a first hand-in from a revised one: both wait for the admin, so draft_review stands for
// draft_revised too, and draft_revised is not a filter of its own.

import { BadRequestException } from '@nestjs/common';
import type { content_status } from '@prisma/client';

export const TASK_STATUS_FILTERS = [
  'scheduled',
  'draft_review',
  'draft_revision',
  'draft_approved',
  'link_submitted',
] as const;

export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

function isTaskStatusFilter(value: unknown): value is TaskStatusFilter {
  return (TASK_STATUS_FILTERS as readonly unknown[]).includes(value);
}

/**
 * The filter a query asks for, or undefined when it names none. Anything outside the list,
 * including a repeated parameter, is a 400 rather than an unfiltered list (OWASP A03).
 */
export function checkTaskStatus(value: unknown): TaskStatusFilter | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isTaskStatusFilter(value)) {
    throw new BadRequestException(
      `status must be one of ${TASK_STATUS_FILTERS.join(', ')}`,
    );
  }
  return value;
}

/** The stored statuses a filter matches. */
export function statusesFor(filter: TaskStatusFilter): content_status[] {
  return filter === 'draft_review' ? ['draft_review', 'draft_revised'] : [filter];
}
