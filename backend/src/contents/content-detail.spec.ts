import { describe, expect, it } from 'vitest';
import {
  buildEvents,
  isOverdue,
  toContentDetail,
  waitingOnFor,
  type ContentDetailRow,
} from './content-detail.js';

const DEADLINE = new Date('2026-09-30T00:00:00.000Z');

function row(overrides: Partial<ContentDetailRow> = {}): ContentDetailRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Evg_Test 1',
    type: 'evergreen',
    brief: '',
    deadline: DEADLINE,
    status: 'scheduled',
    video_link: null,
    video_submitted_at: null,
    created_at: new Date('2026-09-01T03:00:00.000Z'),
    updated_at: new Date('2026-09-01T03:00:00.000Z'),
    contracts: {
      creators: {
        first_name: 'Rangga',
        middle_name: null,
        last_name: 'Pratama',
      },
    },
    submissions: [],
    ...overrides,
  };
}

function submission(overrides: Partial<ContentDetailRow['submissions'][number]> = {}) {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    link: 'https://drive.google.com/draft-v1',
    created_at: new Date('2026-09-10T10:00:00.000Z'),
    updated_at: new Date('2026-09-11T08:00:00.000Z'),
    revision_notes: null,
    ...overrides,
  };
}

describe('waitingOnFor', () => {
  it.each([
    ['pending', 'admin'],
    ['draft_review', 'admin'],
    ['scheduled', 'creator'],
    ['draft_revision', 'creator'],
    ['draft_approved', 'creator'],
    ['link_submitted', null],
  ] as const)('answers %s as %s', (status, expected) => {
    expect(waitingOnFor(status)).toBe(expected);
  });
});

describe('isOverdue', () => {
  it('is true once the deadline has passed and the link is not in', () => {
    expect(isOverdue('draft_approved', '2026-09-29', '2026-09-30')).toBe(true);
  });

  it('is false on the deadline day itself', () => {
    expect(isOverdue('scheduled', '2026-09-30', '2026-09-30')).toBe(false);
  });

  it('is false before the deadline', () => {
    expect(isOverdue('scheduled', '2026-09-30', '2026-09-29')).toBe(false);
  });

  it('is false on finished content however late the deadline was', () => {
    expect(isOverdue('link_submitted', '2026-09-01', '2026-09-30')).toBe(false);
  });

  it('is false on a pending proposal, which is not committed work yet', () => {
    expect(isOverdue('pending', '2026-09-01', '2026-09-30')).toBe(false);
  });
});

describe('buildEvents', () => {
  it('starts a never-touched content with one scheduled event', () => {
    const events = buildEvents(row());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'scheduled',
      at: '2026-09-01T03:00:00.000Z',
      actor: { name: null, role: 'admin' },
    });
  });

  it('numbers drafts from the oldest hand-in and lists the newest event first', () => {
    const events = buildEvents(
      row({
        submissions: [
          submission({
            id: 'aaaaaaaa-0000-0000-0000-000000000001',
            created_at: new Date('2026-09-10T10:00:00.000Z'),
          }),
          submission({
            id: 'aaaaaaaa-0000-0000-0000-000000000002',
            link: 'https://drive.google.com/draft-v2',
            created_at: new Date('2026-09-14T10:00:00.000Z'),
          }),
        ],
      }),
    );

    const drafts = events.filter((event) => event.type === 'draft_submitted');
    expect(drafts.map((event) => event.payload?.version)).toEqual([2, 1]);
    expect(drafts.at(1)?.payload).toEqual({
      version: 1,
      link: 'https://drive.google.com/draft-v1',
    });
    expect(events.at(0)?.type).toBe('draft_submitted');
    expect(events.at(0)?.payload).toEqual({
      version: 2,
      link: 'https://drive.google.com/draft-v2',
    });
  });

  it('records a revision request on the submission the admin annotated', () => {
    const events = buildEvents(
      row({
        status: 'draft_revision',
        submissions: [
          submission({ revision_notes: 'Durasi lewat 30 detik, mohon dipangkas.' }),
        ],
      }),
    );

    const revision = events.find((event) => event.type === 'revision_requested');
    expect(revision).toMatchObject({
      at: '2026-09-11T08:00:00.000Z',
      actor: { role: 'admin' },
      payload: { note: 'Durasi lewat 30 detik, mohon dipangkas.' },
    });
  });

  it('ignores a submission whose revision note says nothing', () => {
    const events = buildEvents(
      row({
        status: 'draft_revision',
        submissions: [submission({ revision_notes: '   ' })],
      }),
    );

    expect(events.some((event) => event.type === 'revision_requested')).toBe(false);
  });

  it('adds the approval only while the content still sits in Draft Approved', () => {
    const events = buildEvents(
      row({
        status: 'draft_approved',
        updated_at: new Date('2026-09-12T09:00:00.000Z'),
        submissions: [submission()],
      }),
    );

    expect(events.find((event) => event.type === 'draft_approved')).toMatchObject({
      at: '2026-09-12T09:00:00.000Z',
      actor: { role: 'admin' },
    });
  });

  it('cannot claim an approval once the link has moved the status on', () => {
    const events = buildEvents(
      row({
        status: 'link_submitted',
        updated_at: new Date('2026-09-13T09:00:00.000Z'),
        submissions: [submission()],
      }),
    );

    expect(events.some((event) => event.type === 'draft_approved')).toBe(false);
  });

  it('ends a finished content with the link event carrying the video url', () => {
    const events = buildEvents(
      row({
        status: 'link_submitted',
        video_link: 'https://instagram.com/reel/abc',
        video_submitted_at: new Date('2026-09-15T00:00:00.000Z'),
        submissions: [submission()],
      }),
    );

    expect(events.at(0)).toMatchObject({
      type: 'link_submitted',
      at: '2026-09-15T00:00:00.000Z',
      actor: { name: 'Rangga Pratama', role: 'creator' },
      payload: { link: 'https://instagram.com/reel/abc' },
    });
  });

  it('keeps a deterministic order when two events share a timestamp', () => {
    const same = new Date('2026-09-10T10:00:00.000Z');
    const events = buildEvents(
      row({
        submissions: [
          submission({ id: 'bbbbbbbb-0000-0000-0000-000000000002', created_at: same }),
          submission({ id: 'bbbbbbbb-0000-0000-0000-000000000001', created_at: same }),
        ],
      }),
    );

    const drafts = events.filter((event) => event.type === 'draft_submitted');
    expect(drafts.map((event) => event.id)).toEqual([
      'bbbbbbbb-0000-0000-0000-000000000002',
      'bbbbbbbb-0000-0000-0000-000000000001',
    ]);
  });
});

describe('toContentDetail', () => {
  it('joins the creator name, the ISO deadline day and the waiting side', () => {
    const detail = toContentDetail(row(), '2026-09-20');

    expect(detail).toMatchObject({
      name: 'Evg_Test 1',
      creatorName: 'Rangga Pratama',
      deadline: '2026-09-30',
      status: 'scheduled',
      waitingOn: 'creator',
      latestSubmissionId: null,
      creatorActions: ['submit_draft'],
    });
  });

  it('picks the latest hand-in whatever order the rows arrive in', () => {
    const detail = toContentDetail(
      row({
        status: 'draft_review',
        submissions: [
          submission({
            id: 'cccccccc-0000-0000-0000-000000000002',
            created_at: new Date('2026-09-14T10:00:00.000Z'),
          }),
          submission({
            id: 'cccccccc-0000-0000-0000-000000000001',
            created_at: new Date('2026-09-10T10:00:00.000Z'),
          }),
        ],
      }),
      '2026-09-20',
    );

    expect(detail.latestSubmissionId).toBe('cccccccc-0000-0000-0000-000000000002');
    expect(detail.waitingOn).toBe('admin');
  });

  it('flags overdue work and never finished work', () => {
    const overdue = toContentDetail(
      row({ status: 'draft_revision' }),
      '2026-10-01',
    );
    const done = toContentDetail(
      row({ status: 'link_submitted', video_submitted_at: new Date('2026-09-28T00:00:00.000Z') }),
      '2026-10-01',
    );

    expect(overdue.tags.overdue).toBe(true);
    expect(done.tags.overdue).toBe(false);
  });

  it('leaves the late and bypass tags to the write-time columns of PBI 6.2', () => {
    const detail = toContentDetail(
      row({ status: 'link_submitted', video_submitted_at: new Date('2026-09-28T00:00:00.000Z') }),
      '2026-09-20',
    );

    expect(detail.tags.lateSubmission).toBe(false);
    expect(detail.tags.approvalBypassed).toBe(false);
  });

  it('offers the creator hand-in buttons a finished content no longer has', () => {
    const detail = toContentDetail(
      row({
        status: 'link_submitted',
        video_submitted_at: new Date('2026-09-28T00:00:00.000Z'),
      }),
      '2026-09-20',
    );

    expect(detail.creatorActions).toEqual([]);
    expect(detail.waitingOn).toBeNull();
  });
});
