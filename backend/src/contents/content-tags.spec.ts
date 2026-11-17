import {
  CONTENT_TAGS,
  contentTags,
  type ContentTagInput,
} from './content-tags.js';

const TODAY = new Date('2026-09-18T00:00:00Z');

/** A calendar day relative to TODAY, the way Postgres `date` columns arrive (midnight UTC). */
function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 18 + offset));
}

function input(overrides: Partial<ContentTagInput> = {}): ContentTagInput {
  return {
    deadline: day(0),
    status: 'scheduled',
    videoSubmittedAt: null,
    approvalBypassed: false,
    ...overrides,
  };
}

describe('CONTENT_TAGS', () => {
  it('lists the three tags in the order they are reported', () => {
    expect(CONTENT_TAGS).toEqual([
      'overdue',
      'late_submission',
      'approval_bypassed',
    ]);
  });
});

describe('contentTags', () => {
  it('reports no tags for open work before its deadline', () => {
    expect(contentTags(input({ deadline: day(3) }), TODAY)).toEqual([]);
  });

  describe('overdue: past the deadline with no video link yet', () => {
    it('is overdue once the deadline day is behind today in Jakarta with no video', () => {
      expect(contentTags(input({ deadline: day(-1) }), TODAY)).toEqual([
        'overdue',
      ]);
    });

    it('is not overdue on the deadline day itself', () => {
      expect(contentTags(input({ deadline: day(0) }), TODAY)).toEqual([]);
    });

    it('reads today in Jakarta, so 17:00 UTC already belongs to the next day', () => {
      const lateEvening = new Date('2026-09-18T17:00:00Z');

      expect(contentTags(input({ deadline: day(0) }), lateEvening)).toEqual([
        'overdue',
      ]);
    });

    it('reads today in Jakarta, so 16:59 UTC is still the deadline day', () => {
      const evening = new Date('2026-09-18T16:59:00Z');

      expect(contentTags(input({ deadline: day(0) }), evening)).toEqual([]);
    });

    it('stays overdue while a draft is in, since the video link is what is owed', () => {
      expect(
        contentTags(input({ deadline: day(-3), status: 'draft_review' }), TODAY),
      ).toEqual(['overdue']);
    });

    it('never marks a pending proposal overdue', () => {
      expect(
        contentTags(input({ deadline: day(-5), status: 'pending' }), TODAY),
      ).toEqual([]);
    });

    it('never marks link_submitted content overdue, even without a video date', () => {
      expect(
        contentTags(
          input({ deadline: day(-5), status: 'link_submitted' }),
          TODAY,
        ),
      ).toEqual([]);
    });
  });

  describe('late_submission: the video link came in after the deadline day', () => {
    it('marks a video link handed in after the deadline day, and not overdue', () => {
      const tags = contentTags(
        input({
          deadline: day(-2),
          status: 'link_submitted',
          videoSubmittedAt: day(-1),
        }),
        TODAY,
      );

      expect(tags).toEqual(['late_submission']);
    });

    it('is not late when the video link is handed in on the deadline day', () => {
      const tags = contentTags(
        input({
          deadline: day(-2),
          status: 'link_submitted',
          videoSubmittedAt: day(-2),
        }),
        TODAY,
      );

      expect(tags).toEqual([]);
    });
  });

  describe('approval_bypassed', () => {
    it('reports a bypassed approval on its own', () => {
      const tags = contentTags(
        input({
          deadline: day(0),
          status: 'link_submitted',
          videoSubmittedAt: day(0),
          approvalBypassed: true,
        }),
        TODAY,
      );

      expect(tags).toEqual(['approval_bypassed']);
    });

    it('reports a late link and a bypass in the fixed order', () => {
      const tags = contentTags(
        input({
          deadline: day(-3),
          status: 'link_submitted',
          videoSubmittedAt: day(-1),
          approvalBypassed: true,
        }),
        TODAY,
      );

      expect(tags).toEqual(['late_submission', 'approval_bypassed']);
    });
  });
});
