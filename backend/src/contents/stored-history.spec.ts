import { fromStoredHistory, type StoredEventRow } from './stored-history.js';

describe('fromStoredHistory', () => {
  // PBI-27 AC 17: the platform replacing typed numbers is a step, by the system.
  it('reads manual numbers the platform replaced as their own step', () => {
    const [event] = fromStoredHistory([
      {
        id: 'event-1',
        event_type: 'Performance Replaced',
        actor_name: 'Sistem',
        actor_role: 'system',
        occurred_at: new Date('2026-11-03T19:00:00.000Z'),
        event_data: { platform: 'tiktok' },
      },
    ]);

    expect(event.type).toBe('performance_replaced');
    expect(event.payload).toEqual({ platform: 'tiktok' });
    expect(event.actor.role).toBe('system');
  });

  // PBI-27 AC 16, 17: a number step shows what moved, and only that.
  it.each(['Performance Entered', 'Performance Replaced'])(
    'reads what moved on a %s step',
    (event_type) => {
      const [event] = fromStoredHistory([
        {
          id: 'event-1',
          event_type,
          actor_name: 'Admin',
          actor_role: 'admin',
          occurred_at: new Date('2026-11-03T19:00:00.000Z'),
          event_data: {
            platform: 'tiktok',
            before: { views: 100, likes: null, comments: 2, shares: 1 },
            after: { views: 12400, likes: 5, comments: 2, shares: 1 },
          },
        },
      ]);

      expect(event.payload?.changes).toEqual([
        { metric: 'views', before: 100, after: 12400 },
        { metric: 'likes', before: null, after: 5 },
      ]);
    },
  );

  it('leaves the changes out of a step stored without values', () => {
    const [event] = fromStoredHistory([
      {
        id: 'event-1',
        event_type: 'Performance Entered',
        actor_name: 'Admin',
        actor_role: 'admin',
        occurred_at: new Date('2026-11-03T19:00:00.000Z'),
        event_data: { platform: 'tiktok' },
      },
    ]);

    expect(event.payload).toEqual({ platform: 'tiktok' });
  });
});

// PBI-33, 33.1: follow-ups an admin added under a revision note already sent (AC 4, AC 6).
describe('fromStoredHistory follow-up notes', () => {
  function row(
    id: string,
    event_type: string,
    at: string,
    event_data: unknown = {},
  ): StoredEventRow {
    return {
      id,
      event_type,
      actor_name: event_type === 'Draft Submitted' ? 'Rangga' : 'Admin',
      actor_role: event_type === 'Draft Submitted' ? 'creator' : 'admin',
      occurred_at: new Date(at),
      event_data,
    };
  }

  const followUp = (id: string, at: string, note: string) =>
    row(`event-${id}`, 'Revision Followup Added', at, {
      note,
      submission_id: 'sub-1',
      follow_up_id: id,
    });

  const revisionOf = (
    events: ReturnType<typeof fromStoredHistory>,
    id: string,
  ) => events.find((event) => event.id === id);

  // AC 6: the timeline shows "Catatan susulan ditambahkan" as its own step, by an admin only.
  it('reads a follow-up as its own step, naming no admin', () => {
    const [event] = fromStoredHistory([
      followUp('fu-1', '2026-11-09T04:00:00.000Z', 'Intro juga dipotong ya.'),
    ]);

    expect(event).toEqual({
      id: 'event-fu-1',
      type: 'revision_followup_added',
      at: '2026-11-09T04:00:00.000Z',
      actor: { name: null, role: 'admin' },
    });
  });

  // AC 2 with PBI-34: a formatted follow-up reaches the reader with its formatting.
  it("carries a formatted follow-up's HTML under its revision request", () => {
    const events = fromStoredHistory([
      row('event-fu-1', 'Revision Followup Added', '2026-11-09T04:00:00.000Z', {
        note: 'Ralat: musik',
        note_html: '<p><strong>Ralat</strong>: musik</p>',
        submission_id: 'sub-1',
        follow_up_id: 'fu-1',
      }),
      row('rev-1', 'Revision Requested', '2026-11-09T03:00:00.000Z', {
        revision_note: 'Tolong perbaiki intro.',
        submission_id: 'sub-1',
      }),
    ]);

    expect(revisionOf(events, 'rev-1')?.payload?.followUps).toEqual([
      {
        id: 'fu-1',
        note: 'Ralat: musik',
        noteHtml: '<p><strong>Ralat</strong>: musik</p>',
        at: '2026-11-09T04:00:00.000Z',
        actor: { name: 'Admin' },
      },
    ]);
  });

  // AC 4: the note the creator read stays as it was, with the follow-ups under it, oldest first.
  it('lists the follow-ups under the revision request they add to, oldest first', () => {
    const events = fromStoredHistory([
      followUp('fu-2', '2026-11-09T05:00:00.000Z', 'Ralat: musik versi kedua.'),
      followUp('fu-1', '2026-11-09T04:00:00.000Z', 'Intro juga dipotong ya.'),
      row('rev-1', 'Revision Requested', '2026-11-09T03:00:00.000Z', {
        revision_note: 'Tolong perbaiki intro.',
      }),
      row('sub-1', 'Draft Submitted', '2026-11-09T02:00:00.000Z', {
        version: 1,
      }),
    ]);

    expect(revisionOf(events, 'rev-1')?.payload).toEqual({
      note: 'Tolong perbaiki intro.',
      followUps: [
        {
          id: 'fu-1',
          note: 'Intro juga dipotong ya.',
          at: '2026-11-09T04:00:00.000Z',
          actor: { name: 'Admin' },
        },
        {
          id: 'fu-2',
          note: 'Ralat: musik versi kedua.',
          at: '2026-11-09T05:00:00.000Z',
          actor: { name: 'Admin' },
        },
      ],
    });
  });

  // Corner: a later round's follow-ups never land under an earlier round's note.
  it('keeps the follow-ups of each round under its own revision request', () => {
    const events = fromStoredHistory([
      followUp('fu-b', '2026-11-10T04:00:00.000Z', 'Round dua.'),
      row('rev-2', 'Revision Requested', '2026-11-10T03:00:00.000Z', {
        revision_note: 'Subtitle belum ada.',
      }),
      row('sub-2', 'Draft Submitted', '2026-11-10T02:00:00.000Z', {
        version: 2,
      }),
      followUp('fu-a', '2026-11-09T04:00:00.000Z', 'Round satu.'),
      row('rev-1', 'Revision Requested', '2026-11-09T03:00:00.000Z', {
        revision_note: 'Tolong perbaiki intro.',
      }),
    ]);

    expect(
      revisionOf(events, 'rev-2')?.payload?.followUps?.map((item) => item.id),
    ).toEqual(['fu-b']);
    expect(
      revisionOf(events, 'rev-1')?.payload?.followUps?.map((item) => item.id),
    ).toEqual(['fu-a']);
  });

  // Corner (AC 4): two requests saved at the same instant, as the local seed has them. Each
  // follow-up names its draft, and so does each request, so the tie decides nothing.
  it('lists a follow-up under the request of its own draft, even when two share a time', () => {
    const at = '2026-10-09T11:45:57.950Z';
    const events = fromStoredHistory([
      followUp('fu-1', '2026-11-09T04:00:00.000Z', 'Intro juga dipotong ya.'),
      row('rev-old', 'Revision Requested', at, {
        revision_note: 'Revisi ke-1',
        submission_id: 'sub-0',
      }),
      row('rev-new', 'Revision Requested', at, {
        revision_note: 'Revisi ke-2',
        submission_id: 'sub-1',
      }),
    ]);

    expect(
      revisionOf(events, 'rev-new')?.payload?.followUps?.map((item) => item.id),
    ).toEqual(['fu-1']);
    expect(revisionOf(events, 'rev-old')?.payload).toEqual({
      note: 'Revisi ke-1',
    });
  });

  // Corner: a revision request nothing was added to sends no follow-up list at all.
  it('sends no follow-up list on a revision request without follow-ups', () => {
    const [event] = fromStoredHistory([
      row('rev-1', 'Revision Requested', '2026-11-09T03:00:00.000Z', {
        revision_note: 'Tolong perbaiki intro.',
      }),
    ]);

    expect(event.payload).toEqual({ note: 'Tolong perbaiki intro.' });
  });

  // Negative: a stored follow-up missing its note or id is not listed, and one with no revision
  // request before it is listed nowhere, rather than under a guess.
  it('lists no follow-up it cannot read or place', () => {
    const events = fromStoredHistory([
      row('event-x', 'Revision Followup Added', '2026-11-09T06:00:00.000Z', {
        note: '  ',
        follow_up_id: 'fu-x',
      }),
      row('event-y', 'Revision Followup Added', '2026-11-09T05:00:00.000Z', {
        note: 'Tanpa id.',
      }),
      row('rev-1', 'Revision Requested', '2026-11-09T03:00:00.000Z', {
        revision_note: 'Tolong perbaiki intro.',
      }),
      followUp('fu-0', '2026-11-08T04:00:00.000Z', 'Sebelum ada revisi.'),
    ]);

    expect(revisionOf(events, 'rev-1')?.payload).toEqual({
      note: 'Tolong perbaiki intro.',
    });
    expect(events.map((event) => event.type)).toEqual([
      'revision_followup_added',
      'revision_followup_added',
      'revision_requested',
      'revision_followup_added',
    ]);
  });
});
