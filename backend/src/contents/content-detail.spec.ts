import { describe, expect, it } from 'vitest';
import {
  buildEvents,
  toContentDetail,
  waitingOnFor,
  type ContentDetailRow,
} from './content-detail.js';

const DEADLINE = new Date('2026-09-30T00:00:00.000Z');

/** Midday in Jakarta on the given day, so the day is the same on either side of UTC. */
function on(day: string): Date {
  return new Date(`${day}T05:00:00.000Z`);
}

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
    approval_bypassed: false,
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
    const detail = toContentDetail(row(), on('2026-09-20'));

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
      on('2026-09-20'),
    );

    expect(detail.latestSubmissionId).toBe('cccccccc-0000-0000-0000-000000000002');
    expect(detail.waitingOn).toBe('admin');
  });

  it('flags overdue work and never finished work', () => {
    const overdue = toContentDetail(
      row({ status: 'draft_revision' }),
      on('2026-10-01'),
    );
    const done = toContentDetail(
      row({ status: 'link_submitted', video_submitted_at: new Date('2026-09-28T00:00:00.000Z') }),
      on('2026-10-01'),
    );

    expect(overdue.tags).toEqual(['overdue']);
    expect(done.tags).toEqual([]);
  });

  it('counts overdue by the Jakarta day, which starts seven hours before the UTC one', () => {
    // 18:00 UTC on the deadline day is already 01:00 the next day in Jakarta.
    const detail = toContentDetail(row(), new Date('2026-09-30T18:00:00.000Z'));

    expect(detail.tags).toEqual(['overdue']);
  });

  it('never tags a pending proposal as overdue', () => {
    const detail = toContentDetail(row({ status: 'pending' }), on('2026-10-05'));

    expect(detail.tags).toEqual([]);
  });

  it('tags a late submission by the latest draft, whatever order the rows arrive in', () => {
    const detail = toContentDetail(
      row({
        status: 'draft_review',
        submissions: [
          submission({
            id: 'dddddddd-0000-0000-0000-000000000002',
            created_at: new Date('2026-10-02T03:00:00.000Z'),
          }),
          submission({
            id: 'dddddddd-0000-0000-0000-000000000001',
            created_at: new Date('2026-09-10T10:00:00.000Z'),
          }),
        ],
      }),
      on('2026-10-03'),
    );

    expect(detail.tags).toEqual(['late_submission', 'overdue']);
  });

  it('tags a video link that came in after the deadline day as a late submission', () => {
    const detail = toContentDetail(
      row({ status: 'link_submitted', video_submitted_at: new Date('2026-10-02T00:00:00.000Z') }),
      on('2026-10-03'),
    );

    expect(detail.tags).toEqual(['late_submission']);
  });

  it('tags a link handed in without an approval from the flag stored at hand-in', () => {
    const detail = toContentDetail(
      row({
        status: 'link_submitted',
        video_submitted_at: new Date('2026-09-28T00:00:00.000Z'),
        approval_bypassed: true,
      }),
      on('2026-10-03'),
    );

    expect(detail.tags).toEqual(['approval_bypassed']);
  });

  it('opens the H-1 video hand-in by the Jakarta day too', () => {
    // 18:00 UTC on the 28th is 01:00 on the 29th in Jakarta, the day before the deadline.
    const before = toContentDetail(row(), on('2026-09-28'));
    const dayBefore = toContentDetail(row(), new Date('2026-09-28T18:00:00.000Z'));

    expect(before.creatorActions).toEqual(['submit_draft']);
    expect(dayBefore.creatorActions).toEqual(['submit_draft', 'submit_video']);
  });

  it('offers the creator hand-in buttons a finished content no longer has', () => {
    const detail = toContentDetail(
      row({
        status: 'link_submitted',
        video_submitted_at: new Date('2026-09-28T00:00:00.000Z'),
      }),
      on('2026-09-20'),
    );

    expect(detail.creatorActions).toEqual([]);
    expect(detail.waitingOn).toBeNull();
  });
});
