import { BadRequestException } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '../../creators/paging.js';
import { isUuid } from '../../uuid.js';

// The links one page of "Performa Konten" shows (SCRUM-285), checked before any read.

/**
 * The body's link ids, each once. Anything but 1 to MAX_PAGE_SIZE uuids is a 400 (OWASP A05):
 * a request can neither reach the database with a malformed id nor turn "this page" into the
 * whole table.
 */
export function checkLinkIds(body: unknown): string[] {
  const linkIds = (body as { linkIds?: unknown } | null | undefined)?.linkIds;
  if (
    !Array.isArray(linkIds) ||
    linkIds.length === 0 ||
    linkIds.length > MAX_PAGE_SIZE ||
    !linkIds.every(isUuid)
  ) {
    throw new BadRequestException({
      code: 'INVALID_LINK_IDS',
      message: `linkIds must be 1 to ${MAX_PAGE_SIZE} link ids`,
    });
  }
  return [...new Set(linkIds)];
}
