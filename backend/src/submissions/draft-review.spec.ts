import { checkReviewable, REVIEWABLE_STATUSES } from './draft-review.js';

describe('checkReviewable', () => {
  it.each(['draft_review', 'draft_revised'])(
    'accepts the latest submission of a draft in %s',
    (contentStatus) => {
      expect(checkReviewable({ contentStatus, isLatest: true })).toBeNull();
    },
  );

  it.each(['scheduled', 'draft_revision', 'draft_approved', 'link_submitted'])(
    'rejects a draft in %s because no decision is pending',
    (contentStatus) => {
      expect(checkReviewable({ contentStatus, isLatest: true })).toBe(
        'DRAFT_NOT_REVIEWABLE',
      );
    },
  );

  it('rejects an older submission once the creator has resubmitted', () => {
    expect(
      checkReviewable({ contentStatus: 'draft_revised', isLatest: false }),
    ).toBe('SUBMISSION_SUPERSEDED');
  });

  it('reports a decided draft before a superseded submission', () => {
    expect(
      checkReviewable({ contentStatus: 'draft_approved', isLatest: false }),
    ).toBe('DRAFT_NOT_REVIEWABLE');
  });

  it('lists exactly the statuses the review queue shows', () => {
    expect(REVIEWABLE_STATUSES).toEqual(['draft_review', 'draft_revised']);
  });
});
