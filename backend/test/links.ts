import type { social_platform } from '@prisma/client';
import { normalizeVideoLink } from '../src/contents/content-links.js';

/**
 * A video link as content_links stores it (PBI-38), for a nested create under a content: keyed
 * the way the submit endpoint keys it, so the database's check on the key accepts it.
 */
export function storedLink(
  url: string,
  submittedAt: Date,
  submittedBy: string,
  platform: social_platform | null,
) {
  return {
    platform,
    url,
    normalized_url: normalizeVideoLink(url),
    submitted_at: submittedAt,
    submitted_by: submittedBy,
  };
}
