import { safeHref } from "./safe-href";

// Drafts are handed in as Google Drive links, the one place the admin opens them from. The
// backend holds the same rule (contents/draft-link.ts); this copy flags a wrong link while it is
// typed, the backend still decides.

/** The API's limit on a draft link (backend draft-submission.ts). */
export const MAX_DRAFT_LINK_LENGTH = 2048;

const DRIVE_HOST = "drive.google.com";

export const DRAFT_LINK_NOT_DRIVE =
  "Link draft harus dari Google Drive (drive.google.com)";

/** True for an https link whose host is exactly Google Drive. */
export function isGoogleDriveLink(link: string): boolean {
  const href = safeHref(link);
  if (href === null) return false;

  // The parser, not a string match, finds the host: "drive.google.com@evil.example" and
  // "drive.google.com.evil.example" both parse to another host and are refused.
  const url = new URL(href);
  return url.protocol === "https:" && url.hostname.toLowerCase() === DRIVE_HOST;
}
