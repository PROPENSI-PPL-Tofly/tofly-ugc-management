import {
  canSubmitDraft,
  canSubmitVideo,
  inGraceWindow,
  taskActions,
} from './task-actions.js';

const DEADLINE = '2026-10-20';

describe('inGraceWindow', () => {
  it('is closed two days before the deadline', () => {
    expect(inGraceWindow(DEADLINE, '2026-10-18')).toBe(false);
  });

  it('opens on H-1', () => {
    expect(inGraceWindow(DEADLINE, '2026-10-19')).toBe(true);
  });

  it('stays open on the deadline and after it, since a late link still counts', () => {
    expect(inGraceWindow(DEADLINE, '2026-10-20')).toBe(true);
    expect(inGraceWindow(DEADLINE, '2026-11-02')).toBe(true);
  });

  it('counts H-1 across a month boundary', () => {
    expect(inGraceWindow('2026-11-01', '2026-10-31')).toBe(true);
    expect(inGraceWindow('2026-11-01', '2026-10-30')).toBe(false);
  });
});

describe('canSubmitDraft', () => {
  it.each([
    ['scheduled', true],
    ['draft_revision', true],
    ['draft_review', false],
    ['draft_revised', false],
    ['draft_approved', false],
    ['link_submitted', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(canSubmitDraft(status)).toBe(expected);
  });
});

describe('canSubmitVideo', () => {
  const FAR = '2026-10-10';
  const H_MINUS_1 = '2026-10-19';

  it('allows an approved draft long before the deadline', () => {
    expect(canSubmitVideo('draft_approved', DEADLINE, FAR)).toBe(true);
  });

  it.each([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_revised',
  ] as const)(
    'refuses %s outside the grace window and allows it inside',
    (status) => {
      expect(canSubmitVideo(status, DEADLINE, FAR)).toBe(false);
      expect(canSubmitVideo(status, DEADLINE, H_MINUS_1)).toBe(true);
    },
  );

  it('never allows a second link once one is submitted', () => {
    expect(canSubmitVideo('link_submitted', DEADLINE, FAR)).toBe(false);
    expect(canSubmitVideo('link_submitted', DEADLINE, H_MINUS_1)).toBe(false);
  });
});

describe('taskActions', () => {
  const FAR = '2026-10-10';
  const H_MINUS_1 = '2026-10-19';

  it.each([
    ['scheduled', FAR, ['submit_draft']],
    ['draft_revision', FAR, ['resubmit_draft']],
    ['draft_review', FAR, []],
    ['draft_revised', FAR, []],
    ['draft_approved', FAR, ['submit_video']],
    ['link_submitted', FAR, []],
    ['scheduled', H_MINUS_1, ['submit_draft', 'submit_video']],
    ['draft_revision', H_MINUS_1, ['resubmit_draft', 'submit_video']],
    ['draft_review', H_MINUS_1, ['submit_video']],
    ['draft_approved', H_MINUS_1, ['submit_video']],
    ['link_submitted', H_MINUS_1, []],
  ] as const)('%s on %s → %j', (status, today, expected) => {
    expect(taskActions(status, DEADLINE, today)).toEqual(expected);
  });
});
