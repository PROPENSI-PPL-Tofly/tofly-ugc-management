import { pageAcrossSegments } from './page-segments.js';

describe('pageAcrossSegments', () => {
  it('reads a page wholly from the first segment when it fits there', () => {
    expect(pageAcrossSegments(0, 5, 12)).toEqual({
      first: { skip: 0, take: 5 },
      second: null,
    });
  });

  it('finishes the first segment and tops the page up from the second', () => {
    expect(pageAcrossSegments(10, 5, 12)).toEqual({
      first: { skip: 10, take: 2 },
      second: { skip: 0, take: 3 },
    });
  });

  it('reads only the second segment once the first is used up', () => {
    expect(pageAcrossSegments(15, 5, 12)).toEqual({
      first: null,
      second: { skip: 3, take: 5 },
    });
  });

  it('switches segments exactly on a page boundary', () => {
    expect(pageAcrossSegments(5, 5, 10)).toEqual({
      first: { skip: 5, take: 5 },
      second: null,
    });
    expect(pageAcrossSegments(10, 5, 10)).toEqual({
      first: null,
      second: { skip: 0, take: 5 },
    });
  });

  it('goes straight to the second segment when the first is empty', () => {
    expect(pageAcrossSegments(0, 5, 0)).toEqual({
      first: null,
      second: { skip: 0, take: 5 },
    });
  });
});
