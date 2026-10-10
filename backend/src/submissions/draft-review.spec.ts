import { checkReviewable, REVIEWABLE_STATUSES } from './draft-review.js';

describe('checkReviewable', () => {
  it('accepts the latest submission of a draft waiting for review', () => {
    expect(
      checkReviewable({ contentStatus: 'draft_review', isLatest: true }),
    ).toBeNull();
  });

  it.each([
    'pending',
    'scheduled',
    'draft_revision',
    'draft_approved',
    'link_submitted',
    // Removed by SCRUM-146: a leftover value must not open a decision.
    'draft_revised',
  ])(
    'rejects a draft in %s because no decision is pending',
    (contentStatus) => {
      expect(checkReviewable({ contentStatus, isLatest: true })).toBe(
        'DRAFT_NOT_REVIEWABLE',
      );
    },
  );

  it('rejects an older submission once the creator has resubmitted', () => {
    expect(
      checkReviewable({ contentStatus: 'draft_review', isLatest: false }),
    ).toBe('SUBMISSION_SUPERSEDED');
  });

  it('reports a decided draft before a superseded submission', () => {
    expect(
      checkReviewable({ contentStatus: 'draft_approved', isLatest: false }),
    ).toBe('DRAFT_NOT_REVIEWABLE');
  });

  it('lists exactly the statuses the review queue shows', () => {
    expect(REVIEWABLE_STATUSES).toEqual(['draft_review']);
  });
});
