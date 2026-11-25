import type { EmailEvent } from './email-notifier.js';
import { CreatorEmails, type CreatorEmailClient } from './creator-emails.js';

const CREATOR = '11111111-1111-4111-8111-111111111111';
const CONTENT = '22222222-2222-4222-8222-222222222222';

function setup(found: unknown = {
  first_name: 'Rangga',
  middle_name: null,
  last_name: 'Pratama',
  users: { email: 'rangga@example.com' },
}) {
  const prisma = {
    creators: { findUnique: vi.fn().mockResolvedValue(found) },
  } satisfies CreatorEmailClient;
  const notifier = { notify: vi.fn<(event: EmailEvent) => Promise<void>>().mockResolvedValue() };
  const log = { warn: vi.fn() };
  return { prisma, notifier, log, emails: new CreatorEmails(prisma, notifier, log) };
}

describe('CreatorEmails', () => {
  it('finds the creator by id, with the address and full name the email needs', async () => {
    const { prisma, emails } = setup();

    await emails.contentScheduled({
      creatorId: CREATOR,
      contentId: CONTENT,
      contentName: 'Evg_1_Rangga',
      deadline: '2026-10-10',
    });

    expect(prisma.creators.findUnique).toHaveBeenCalledWith({
      where: { id: CREATOR },
      select: {
        first_name: true,
        middle_name: true,
        last_name: true,
        users: { select: { email: true } },
      },
    });
  });

  // AC 1: Admin schedules new content for the creator. One email per content (AC 8).
  it('sends the new content email, once per content', async () => {
    const { notifier, emails } = setup();

    await emails.contentScheduled({
      creatorId: CREATOR,
      contentId: CONTENT,
      contentName: 'Evg_1_Rangga',
      deadline: '2026-10-10',
    });

    expect(notifier.notify).toHaveBeenCalledWith({
      eventKey: `content_scheduled:${CONTENT}`,
      template: 'content_scheduled',
      to: { email: 'rangga@example.com', name: 'Rangga Pratama' },
      data: { contentId: CONTENT, contentName: 'Evg_1_Rangga', deadline: '2026-10-10' },
    });
  });

  // AC 1: a proposal is rejected, with the reason.
  it('sends the rejected proposal email with the reason Admin gave', async () => {
    const { notifier, emails } = setup();

    await emails.proposalRejected({
      creatorId: CREATOR,
      contentId: CONTENT,
      contentName: 'Ide konten',
      reason: 'Kurang relevan.',
    });

    expect(notifier.notify).toHaveBeenCalledWith({
      eventKey: `proposal_rejected:${CONTENT}`,
      template: 'proposal_rejected',
      to: { email: 'rangga@example.com', name: 'Rangga Pratama' },
      data: { contentName: 'Ide konten', reason: 'Kurang relevan.' },
    });
  });

  it('sends nothing for a creator who no longer exists', async () => {
    const { notifier, emails } = setup(null);

    await emails.contentScheduled({
      creatorId: CREATOR,
      contentId: CONTENT,
      contentName: 'Evg_1_Rangga',
      deadline: '2026-10-10',
    });

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  // AC 9: the action is already saved, so a failed lookup is logged, never thrown at it.
  it('never throws when the creator cannot be read', async () => {
    const { prisma, notifier, log, emails } = setup();
    prisma.creators.findUnique.mockRejectedValue(new TypeError('connection lost'));

    await expect(
      emails.proposalRejected({
        creatorId: CREATOR,
        contentId: CONTENT,
        contentName: 'Ide konten',
        reason: null,
      }),
    ).resolves.toBeUndefined();
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('Email proposal_rejected failed (TypeError)');
  });
});
