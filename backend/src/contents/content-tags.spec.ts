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
    latestDraftAt: null,
    approvalBypassed: false,
    ...overrides,
  };
}

describe('CONTENT_TAGS', () => {
  it('lists the tags in the order they are reported', () => {
    expect(CONTENT_TAGS).toEqual([
      'late_submission',
      'overdue',
      'approval_bypassed',
    ]);
  });
});

describe('contentTags', () => {
  it('reports no tags for open work before its deadline', () => {
    expect(contentTags(input({ deadline: day(3) }), TODAY)).toEqual([]);
  });

  describe('late_submission', () => {
    it('is not late when the draft arrives on the deadline day', () => {
      const tags = contentTags(
        input({
          deadline: day(0),
          status: 'draft_review',
          latestDraftAt: new Date('2026-09-18T10:00:00Z'),
        }),
        TODAY,
      );

      expect(tags).toEqual([]);
    });

    it('counts a draft at 16:59 UTC as the deadline day, since it is still before midnight in Jakarta', () => {
      const tags = contentTags(
        input({
          deadline: day(0),
          status: 'draft_review',
          latestDraftAt: new Date('2026-09-18T16:59:00Z'),
        }),
        TODAY,
      );

      expect(tags).toEqual([]);
    });

    it('counts a draft at 17:30 UTC as the next day, since it is past midnight in Jakarta', () => {
      const tags = contentTags(
        input({
          deadline: day(0),
          status: 'draft_review',
          latestDraftAt: new Date('2026-09-18T17:30:00Z'),
        }),
        TODAY,
      );

      expect(tags).toEqual(['late_submission']);
    });

    it('is late when the video link is handed in after the deadline day', () => {
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
          latestDraftAt: new Date('2026-09-15T08:00:00Z'),
        }),
        TODAY,
      );

      expect(tags).toEqual([]);
    });

    it('stays late for a late draft even when the video arrived on time', () => {
      const tags = contentTags(
        input({
          deadline: day(-2),
          status: 'link_submitted',
          videoSubmittedAt: day(-2),
          latestDraftAt: new Date('2026-09-17T03:00:00Z'),
        }),
        TODAY,
      );

      expect(tags).toEqual(['late_submission']);
    });
  });

  describe('overdue', () => {
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

    it('is not overdue once a video has been handed in', () => {
      expect(
        contentTags(
          input({
            deadline: day(-5),
            status: 'draft_approved',
            videoSubmittedAt: day(-5),
          }),
          TODAY,
        ),
      ).toEqual([]);
    });

    it('combines with a late draft that is still waiting on its video', () => {
      const tags = contentTags(
        input({
          deadline: day(-3),
          status: 'draft_revision',
          latestDraftAt: new Date('2026-09-16T09:00:00Z'),
        }),
        TODAY,
      );

      expect(tags).toEqual(['late_submission', 'overdue']);
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

    it('reports all three tags in the fixed order', () => {
      const tags = contentTags(
        input({
          deadline: day(-3),
          status: 'draft_review',
          latestDraftAt: new Date('2026-09-17T09:00:00Z'),
          approvalBypassed: true,
        }),
        TODAY,
      );

      expect(tags).toEqual(['late_submission', 'overdue', 'approval_bypassed']);
    });
  });
});
