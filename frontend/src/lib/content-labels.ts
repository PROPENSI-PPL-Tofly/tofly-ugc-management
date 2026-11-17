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

/** A content type as a badge: Specific in the accent, Evergreen quiet, so the two tell apart. */
export const CONTENT_TYPE_TONES: Record<ContentType, Tone> = {
  evergreen: "neutral",
  specific: "accent",
};

/** Worded as the prototype words them, on every screen that shows a tag. */
export const CONTENT_TAG_LABELS: Record<ContentTag, string> = {
  overdue: "Overdue",
  late_submission: "Late Submission",
  approval_bypassed: "Approval di-bypass",
};

/**
 * Tags are judgements on top of the status, so they read as pills. Red for a video link still
 * owed past its deadline; the same red, outlined, for one that came in after it, since that work
 * is done; amber for a skipped approval, which is allowed but wants a second look.
 */
export const CONTENT_TAG_TONES: Record<ContentTag, Tone> = {
  overdue: "red",
  late_submission: "redSoft",
  approval_bypassed: "amber",
};
