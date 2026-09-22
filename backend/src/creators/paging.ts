import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE_SIZE = 10;
/** An admin listing has no reason to pull the whole roster in one response. */
export const MAX_PAGE_SIZE = 50;

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
  if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new BadRequestException(
      `pageSize must be between 1 and ${MAX_PAGE_SIZE}`,
    );
  }
  return { page, pageSize };
}
