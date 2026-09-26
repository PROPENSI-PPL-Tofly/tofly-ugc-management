// When a creator may hand in a draft or the final video link (PRD 3.16). Plain functions over
// ISO calendar days, so the Task Saya list and the draft/video endpoints decide eligibility
// from one place and the same "today" (WIB, see jakartaDay).

import type { content_status } from '@prisma/client';

export type TaskAction = 'submit_draft' | 'resubmit_draft' | 'submit_video';

/** H-1: from the day before the deadline, a video link may skip the draft approval. */
export const GRACE_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(day: string, days: number): string {
  const time = new Date(`${day}T00:00:00.000Z`).getTime() - days * DAY_MS;
  return new Date(time).toISOString().slice(0, 10);
}

/** Open from H-1 onward, including after the deadline: a late link is still a link. */
export function inGraceWindow(deadline: string, today: string): boolean {
  // ISO days compare correctly as strings.
  return today >= daysBefore(deadline, GRACE_DAYS);
}

/** A first draft while scheduled, a resubmit after the admin asked for a revision. */
export function canSubmitDraft(status: content_status): boolean {
  return status === 'scheduled' || status === 'draft_revision';
}

/** An approved draft, or any unfinished content inside the grace window. */
export function canSubmitVideo(
  status: content_status,
  deadline: string,
  today: string,
): boolean {
  if (status === 'link_submitted') {
    return false;
  }
  return status === 'draft_approved' || inGraceWindow(deadline, today);
}

/** The buttons a Task Saya row shows, in display order; empty means no button. */
export function taskActions(
  status: content_status,
  deadline: string,
  today: string,
): TaskAction[] {
  const actions: TaskAction[] = [];
  if (canSubmitDraft(status)) {
    actions.push(status === 'scheduled' ? 'submit_draft' : 'resubmit_draft');
  }
  if (canSubmitVideo(status, deadline, today)) {
    actions.push('submit_video');
  }
  return actions;
}
