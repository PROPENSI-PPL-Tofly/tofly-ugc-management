import { FollowUpService, type FollowUpClient } from './follow-up.service.js';

const SUBMISSION = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const CONTENT = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const ADMIN_EMAIL = 'sinta.admin@tofly.id';
const SAVED_AT = new Date(Date.UTC(2026, 10, 9, 4, 0, 0));

interface RoundRow {
  id: string;
  content_id: string;
  revision_notes: string | null;
  contents: { status: string; submissions: { id: string }[] };
}

// The draft under review, with the revision note already sent and no newer draft yet.
function openRound(overrides: Partial<RoundRow> = {}): RoundRow {
  return {
    id: SUBMISSION,
    content_id: CONTENT,
    revision_notes: 'Tolong perbaiki intro.',
    contents: { status: 'draft_revision', submissions: [{ id: SUBMISSION }] },
    ...overrides,
  };
}

// A fake database: it records what the service writes, inside the transaction or outside it.
function fakeClient(
  round: RoundRow | null,
  admin: { id: string; email: string } | null = {
    id: ADMIN,
    email: ADMIN_EMAIL,
  },
) {
  const inTransaction: string[] = [];
  const followUpCreate = vi.fn((args: { data: Record<string, unknown> }) => {
    inTransaction.push('revision_followups');
    return Promise.resolve({ id: 'fu-1', created_at: SAVED_AT, ...args.data });
  });
  const eventCreate = vi.fn(() => {
    inTransaction.push('content_events');
    return Promise.resolve({});
  });
  const usersFind = vi.fn().mockResolvedValue(admin);
  const transaction = {
    revision_followups: { create: followUpCreate },
    content_events: { create: eventCreate },
    users: { findUnique: usersFind },
  };
  const client = {
    submissions: { findUnique: vi.fn().mockResolvedValue(round) },
    $transaction: vi.fn((work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  return {
    service: new FollowUpService(client as unknown as FollowUpClient),
    client,
    usersFind,
    followUpCreate,
    eventCreate,
    inTransaction,
  };
}

describe('FollowUpService.add', () => {
  // Positive (AC 4): the follow-up is kept and answered in the shape the admin's form reads,
  // signed by the email of the admin who wrote it.
  it("keeps the follow-up and answers with it, by the admin's email", async () => {
    const { service, followUpCreate, usersFind } = fakeClient(openRound());

    await expect(
      service.add(SUBMISSION, 'Intro juga dipotong ya.', ADMIN),
    ).resolves.toEqual({
      id: 'fu-1',
      note: 'Intro juga dipotong ya.',
      at: SAVED_AT.toISOString(),
      actor: { name: ADMIN_EMAIL },
    });
    expect(usersFind).toHaveBeenCalledWith({
      where: { id: ADMIN },
      select: { id: true, email: true },
    });
    expect(followUpCreate).toHaveBeenCalledWith({
      data: {
        submission_id: SUBMISSION,
        body: 'Intro juga dipotong ya.',
        author_user_id: ADMIN,
      },
    });
  });

  // AC 6: the timeline records it, by "Admin" only, at the follow-up's own time.
  it('records "Catatan susulan ditambahkan" in the timeline with the follow-up', async () => {
    const { service, eventCreate, inTransaction } = fakeClient(openRound());

    await service.add(SUBMISSION, 'Intro juga dipotong ya.', ADMIN);

    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT,
        event_type: 'Revision Followup Added',
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: ADMIN,
        occurred_at: SAVED_AT,
        event_data: {
          note: 'Intro juga dipotong ya.',
          submission_id: SUBMISSION,
          follow_up_id: 'fu-1',
        },
      },
    });
    // Corner: both in one transaction, so a follow-up never stands without its event.
    expect(inTransaction).toEqual(['revision_followups', 'content_events']);
  });

  // AC 2 with PBI-34: a formatted follow-up keeps its formatting for the timeline and the answer.
  it("keeps a formatted follow-up's HTML with its event and answers with it", async () => {
    const { service, eventCreate } = fakeClient(openRound());

    await expect(
      service.add(SUBMISSION, 'Ralat: musik', ADMIN, '<p><strong>Ralat</strong>: musik</p>'),
    ).resolves.toMatchObject({ noteHtml: '<p><strong>Ralat</strong>: musik</p>' });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_data: expect.objectContaining({
          note: 'Ralat: musik',
          note_html: '<p><strong>Ralat</strong>: musik</p>',
        }),
      }),
    });
  });

  // AC 4: the revision note the creator already read is never written to.
  it('never changes the original revision note', async () => {
    const { service, client } = fakeClient(openRound());

    await service.add(SUBMISSION, 'Intro juga dipotong ya.', ADMIN);

    expect(client).not.toHaveProperty('submissions.update');
    expect(client.submissions).not.toHaveProperty('update');
  });

  it('answers 404 when there is no such submission', async () => {
    const { service, followUpCreate } = fakeClient(null);

    await expect(
      service.add(SUBMISSION, 'Catatan', ADMIN),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'SUBMISSION_NOT_FOUND' },
    });
    expect(followUpCreate).not.toHaveBeenCalled();
  });

  // Negative (AC 3), OWASP A01: only while the round is open; after it, 409 and nothing kept.
  it.each([
    [
      'the creator already sent a new draft',
      openRound({
        contents: { status: 'draft_review', submissions: [{ id: 'newer' }] },
      }),
    ],
    [
      'a newer draft exists, even while the content still reads Draft Perlu Revisi',
      openRound({
        contents: { status: 'draft_revision', submissions: [{ id: 'newer' }] },
      }),
    ],
    [
      'the draft was approved',
      openRound({
        contents: {
          status: 'draft_approved',
          submissions: [{ id: SUBMISSION }],
        },
      }),
    ],
    ['no revision was ever asked on it', openRound({ revision_notes: null })],
  ])('answers 409 when %s', async (_what, round) => {
    const { service, followUpCreate, eventCreate } = fakeClient(round);

    await expect(
      service.add(SUBMISSION, 'Catatan', ADMIN),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'FOLLOWUP_ROUND_CLOSED',
        message: 'Creator sudah mengirim draft baru',
      },
    });
    expect(followUpCreate).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  // Corner: an admin whose account is gone is not signed in, as the revision repository reads it.
  it('answers 401 when the admin account no longer exists, keeping nothing', async () => {
    const { service, followUpCreate } = fakeClient(openRound(), null);

    await expect(
      service.add(SUBMISSION, 'Catatan', ADMIN),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(followUpCreate).not.toHaveBeenCalled();
  });
});
