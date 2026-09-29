// How content types and workflow statuses read in the admin views. One map per enum, shared
// by every view that shows them, so the same status never reads two different ways.

import type { Tone } from "@/components/ui/pill";
import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  scheduled: "Scheduled",
  draft_review: "Draft Menunggu Review",
  draft_revision: "Draft Perlu Revisi",
  draft_revised: "Draft Revised",
  draft_approved: "Draft Approved",
  link_submitted: "Content Link Submitted",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  evergreen: "Evergreen",
  specific: "Specific",
};

/**
 * The dot colour beside each status, always next to its label so colour is never the only
 * signal. Neutral before any work, brand blue while a draft waits on the admin, amber when it
 * came back for a revision, green from approval on.
 */
export const CONTENT_STATUS_TONES: Record<ContentStatus, Tone> = {
  scheduled: "neutral",
  draft_review: "accent",
  draft_revised: "accent",
  draft_revision: "amber",
  draft_approved: "green",
  link_submitted: "green",
};
