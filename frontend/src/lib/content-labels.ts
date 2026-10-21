// How content types and workflow statuses read in the admin views. One map per enum, shared
// by every view that shows them, so the same status never reads two different ways.

import type { Tone } from "@/components/ui/pill";
import type { ContentType } from "./contents";
import type { ContentStatus, ContentTag } from "./creators";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  draft_review: "Draft Menunggu Review",
  draft_revision: "Draft Perlu Revisi",
  draft_approved: "Draft Approved",
  link_submitted: "Content Link Submitted",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  evergreen: "Evergreen",
  specific: "Specific",
};

/**
 * The dot colour beside each status, always next to its label so colour is never the only
 * signal. Brand blue while something waits on the admin (a proposal or a draft), neutral before
 * any work, amber when a draft came back for a revision, green from approval on.
 */
export const CONTENT_STATUS_TONES: Record<ContentStatus, Tone> = {
  pending: "accent",
  scheduled: "neutral",
  draft_review: "accent",
  draft_revision: "amber",
  draft_approved: "green",
  link_submitted: "green",
};

/** Worded as the prototype words them, on every screen that shows a tag. */
export const CONTENT_TAG_LABELS: Record<ContentTag, string> = {
  late_submission: "Late Submission",
  overdue: "Overdue",
  approval_bypassed: "Approval di-bypass",
};

/** The tags a table row shows; the others are read in the content's panel, beside its story. */
const TABLE_TAGS: readonly ContentTag[] = ["overdue"];

/**
 * A row's tags as a table shows them: only Overdue, the one that asks for something now. A late
 * hand-in or a skipped approval is history, and a table full of it hides the rows that matter.
 */
export function tableTags(tags: readonly ContentTag[]): ContentTag[] {
  return tags.filter((tag) => TABLE_TAGS.includes(tag));
}

/**
 * Tags are judgements on top of the status, so they read as pills. Red for a deadline that was
 * missed, whether the hand-in came late or has not come at all; amber for a skipped approval,
 * which is allowed but wants a second look.
 */
export const CONTENT_TAG_TONES: Record<ContentTag, Tone> = {
  late_submission: "red",
  overdue: "red",
  approval_bypassed: "amber",
};
