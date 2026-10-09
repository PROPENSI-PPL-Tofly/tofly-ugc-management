import {
  CONTENT_STATUSES,
  REVIEWABLE_STATUSES,
  canTransition,
  isContentStatus,
  type ContentStatus,
} from './content-lifecycle.js';

describe('CONTENT_STATUSES', () => {
  it('lists exactly the six lifecycle statuses, in lifecycle order', () => {
    expect(CONTENT_STATUSES).toEqual([
      'pending',
      'scheduled',
      'draft_review',
      'draft_revision',
      'draft_approved',
      'link_submitted',
    ]);
  });

  it('no longer knows Draft Revised', () => {
    expect(CONTENT_STATUSES).not.toContain('draft_revised');
  });
});

describe('isContentStatus', () => {
  it.each([...CONTENT_STATUSES])('accepts %s', (status) => {
    expect(isContentStatus(status)).toBe(true);
  });

  it.each([
    ['the removed Draft Revised', 'draft_revised'],
    ['an unknown status', 'done'],
    ['an empty value', ''],
    ['a status in the wrong case', 'Scheduled'],
    ['a status with stray whitespace', ' scheduled'],
    ['a repeated parameter', ['scheduled', 'pending']],
    ['a missing value', undefined],
    ['null', null],
    ['a number', 1],
    ['an inherited object key', 'toString'],
  ])('refuses %s', (_label, value) => {
    expect(isContentStatus(value)).toBe(false);
  });
});

describe('canTransition', () => {
  // Every arrow of the lifecycle; anything not listed here is not a move.
  const ALLOWED: [ContentStatus, ContentStatus][] = [
    ['pending', 'scheduled'],
    ['scheduled', 'draft_review'],
    ['draft_review', 'draft_approved'],
    ['draft_review', 'draft_revision'],
    ['draft_revision', 'draft_review'],
    ['draft_approved', 'link_submitted'],
    // A video link from H-1 onward may skip the draft approval (task-actions.ts).
    ['scheduled', 'link_submitted'],
    ['draft_review', 'link_submitted'],
    ['draft_revision', 'link_submitted'],
  ];

  it.each(ALLOWED)('allows %s to move to %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('refuses every other pair of statuses', () => {
    const allowed = new Set(ALLOWED.map(([from, to]) => `${from}>${to}`));
    const refused = CONTENT_STATUSES.flatMap((from) =>
      CONTENT_STATUSES.filter((to) => !allowed.has(`${from}>${to}`)).map(
        (to) => [from, to] as const,
      ),
    );

    // 6 x 6 pairs, nine of them allowed.
    expect(refused).toHaveLength(27);
    for (const [from, to] of refused) {
      expect(canTransition(from, to), `${from} to ${to}`).toBe(false);
    }
  });

  it.each([...CONTENT_STATUSES])('never moves %s to itself', (status) => {
    expect(canTransition(status, status)).toBe(false);
  });

  it('leaves Content Link Submitted with nowhere to go', () => {
    for (const to of CONTENT_STATUSES) {
      expect(canTransition('link_submitted', to)).toBe(false);
    }
  });

  it('keeps a pending proposal out of the draft flow until it is scheduled', () => {
    expect(canTransition('pending', 'draft_review')).toBe(false);
    expect(canTransition('pending', 'link_submitted')).toBe(false);
  });

  it('never returns to pending', () => {
    for (const from of CONTENT_STATUSES) {
      expect(canTransition(from, 'pending')).toBe(false);
    }
  });
});

describe('REVIEWABLE_STATUSES', () => {
  it('is only Draft Waiting for Review', () => {
    expect(REVIEWABLE_STATUSES).toEqual(['draft_review']);
  });

  it('is exactly the statuses an admin decision can move on from', () => {
    const decidable = CONTENT_STATUSES.filter(
      (status) =>
        canTransition(status, 'draft_approved') ||
        canTransition(status, 'draft_revision'),
    );

    expect(decidable).toEqual([...REVIEWABLE_STATUSES]);
  });
});
