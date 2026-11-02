import { checkManualPerformance } from './manual-performance-input.js';

describe('checkManualPerformance', () => {
  it('keeps whole numbers as given, a real 0 included', () => {
    expect(
      checkManualPerformance({
        views: 12400,
        likes: 500,
        comments: 0,
        shares: 7,
      }),
    ).toEqual({ views: 12400, likes: 500, comments: 0, shares: 7 });
  });

  it('reads a missing, null or blank field as no data, never as 0', () => {
    expect(
      checkManualPerformance({ views: 1, likes: null, comments: '  ' }),
    ).toEqual({ views: 1, likes: null, comments: null, shares: null });
  });
});
