/**
 * The platforms a video link can belong to (PBI-38): one link per platform per content, so a
 * cross-posted video is one content with several links. Pure module — no fetch, no clock — so
 * the link rows, the icons and the deadline picker share one vocabulary and are tested without
 * a DOM.
 */

export type Platform = "instagram" | "tiktok";

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

export const PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[];

/** One submitted link, as GET /contents/:id and the lists answer it (38.1's contract). */
/** One of a content's submitted video links (AC 11), as Content Detail lists them. */
export interface ContentLink {
  /** Null only on a link kept from before platforms were recorded (38.1). */
  platform: Platform | null;
  url: string;
  /** The day the link was handed in, "YYYY-MM-DD": the hour was never stored. */
  submittedAt: string;
}

/**
 * How far before the contract end a deadline may fall: the H-5 buffer. A deadline later than
 * this is refused by the API ("Deadline paling lambat <tanggal> (H-5 akhir kontrak)"), so the
 * picker holds the same line and never offers a date the API would refuse.
 */
export const H5_BUFFER_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The last day a deadline may fall on: the contract's last day minus the H-5 buffer. Plain
 * calendar-day arithmetic in UTC, the way deadline-period counts, so a month end or a leap
 * year cannot move the day.
 */
export function latestDeadline(contractEnd: string): string {
  return new Date(Date.parse(`${contractEnd}T00:00:00Z`) - H5_BUFFER_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** The timeline's words for a link event, one per platform and per move (AC 12). */
export function linkEventTitle(platform: Platform | undefined, replaced = false): string {
  const name = platform ? PLATFORM_LABELS[platform] : "video";
  return replaced ? `Link ${name} diperbarui` : `Link ${name} dikirim`;
}
