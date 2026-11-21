import { BadRequestException } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '../../creators/paging.js';
import { checkLinkIds } from './link-ids.js';

const LINK_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const LINK_B = '6a1d0c9e-2b3f-4a5d-8e7f-9c0b1a2d3e4f';

function idsOf(count: number): string[] {
  return Array.from(
    { length: count },
    (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  );
}

function refusalOf(body: unknown): unknown {
  try {
    checkLinkIds(body);
  } catch (error) {
    return error;
  }
  throw new Error('expected a refusal');
}

describe('checkLinkIds (the links one page of "Performa Konten" shows, SCRUM-285)', () => {
  it("takes the page's link ids", () => {
    expect(checkLinkIds({ linkIds: [LINK_A, LINK_B] })).toEqual([
      LINK_A,
      LINK_B,
    ]);
  });

  it('reads a link the page shows twice only once', () => {
    expect(checkLinkIds({ linkIds: [LINK_A, LINK_B, LINK_A] })).toEqual([
      LINK_A,
      LINK_B,
    ]);
  });

  it('takes as many links as the largest page holds', () => {
    expect(checkLinkIds({ linkIds: idsOf(MAX_PAGE_SIZE) })).toHaveLength(
      MAX_PAGE_SIZE,
    );
  });

  it.each([
    ['no body', undefined],
    ['a body that is not an object', 'link-ids'],
    ['no linkIds', {}],
    ['linkIds that are not a list', { linkIds: LINK_A }],
    ['an empty list', { linkIds: [] }],
    ['an id that is not a uuid', { linkIds: [LINK_A, "1' OR '1'='1"] }],
    ['an id that is not text', { linkIds: [LINK_A, 42] }],
    // More than a page holds: a request cannot turn "this page" into the whole table.
    ['more links than a page holds', { linkIds: idsOf(MAX_PAGE_SIZE + 1) }],
  ])('refuses %s with a 400 before any read (OWASP A05)', (_, body) => {
    const refusal = refusalOf(body);

    expect(refusal).toBeInstanceOf(BadRequestException);
    expect((refusal as BadRequestException).getResponse()).toEqual({
      code: 'INVALID_LINK_IDS',
      message: `linkIds must be 1 to ${MAX_PAGE_SIZE} link ids`,
    });
  });
});
