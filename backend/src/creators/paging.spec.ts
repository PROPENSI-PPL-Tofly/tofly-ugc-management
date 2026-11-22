import { BadRequestException } from '@nestjs/common';
import { checkPaging, MAX_PAGE, MAX_PAGE_SIZE } from './paging.js';

// The pipes only make page an integer, so ?page=99999999999999999999 arrived as 1e20 and the
// skip it gave Prisma ended the request in a 500 (#230 review). Every list reads its paging here.

describe('checkPaging', () => {
  it('keeps a page and size inside the bounds', () => {
    expect(checkPaging(3, 10)).toEqual({ page: 3, pageSize: 10 });
  });

  it('keeps the last page it allows at the largest page size', () => {
    expect(checkPaging(MAX_PAGE, MAX_PAGE_SIZE)).toEqual({
      page: MAX_PAGE,
      pageSize: MAX_PAGE_SIZE,
    });
  });

  it.each([
    ['a page below 1', 0, 10, 'page must be 1 or greater'],
    ['a page past the last it allows', MAX_PAGE + 1, 10, `page must be ${MAX_PAGE} or less`],
    ['a page no number can hold exactly', 1e20, 10, `page must be ${MAX_PAGE} or less`],
    ['a page size of 0', 1, 0, `pageSize must be between 1 and ${MAX_PAGE_SIZE}`],
    ['a page size over the cap', 1, MAX_PAGE_SIZE + 1, `pageSize must be between 1 and ${MAX_PAGE_SIZE}`],
  ])('answers 400 for %s', (_label, page, pageSize, message) => {
    expect(() => checkPaging(page, pageSize)).toThrow(
      new BadRequestException(message),
    );
  });

  // The furthest row a page can start at stays a 32-bit integer, whatever list reads it.
  it('keeps the furthest skip inside a 32-bit integer', () => {
    expect((MAX_PAGE - 1) * MAX_PAGE_SIZE).toBeLessThanOrEqual(2 ** 31 - 1);
  });
});
