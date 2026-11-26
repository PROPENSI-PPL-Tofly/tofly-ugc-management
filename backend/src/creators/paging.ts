import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE_SIZE = 10;
/** An admin listing has no reason to pull the whole roster in one response. */
export const MAX_PAGE_SIZE = 50;

/**
 * The pipes only make page an integer, so ?page=99999999999999999999 arrives as 1e20 and the
 * skip it gives Prisma fails inside the query. No list here comes near this many pages, and the
 * furthest skip, (MAX_PAGE - 1) * MAX_PAGE_SIZE, stays a 32-bit integer.
 */
export const MAX_PAGE = 1_000_000;

export interface Paging {
  page: number;
  pageSize: number;
}

/**
 * Bounds the paging values after the pipes have already made sure they are integers, so a
 * request can neither ask for a page that cannot exist nor size a page to drain the table.
 */
export function checkPaging(page: number, pageSize: number): Paging {
  if (page < 1) {
    throw new BadRequestException('page must be 1 or greater');
  }
  if (page > MAX_PAGE) {
    throw new BadRequestException(`page must be ${MAX_PAGE} or less`);
  }
  if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new BadRequestException(
      `pageSize must be between 1 and ${MAX_PAGE_SIZE}`,
    );
  }
  return { page, pageSize };
}
