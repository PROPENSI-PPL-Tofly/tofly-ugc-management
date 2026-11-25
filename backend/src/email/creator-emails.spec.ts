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
    contents: { findUnique: vi.fn() },
    contracts: { findUnique: vi.fn() },
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

// PBI-11 (11.2, AC 1): the content events, found by the content their service already holds.
describe('CreatorEmails, content events', () => {
  const CREATOR_ROW = {
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    users: { email: 'rangga@example.com' },
  };
  const TO = { email: 'rangga@example.com', name: 'Rangga Pratama' };

  function contentSetup(found: unknown = {
    name: 'Promo Lebaran',
    deadline: new Date('2026-11-25T00:00:00.000Z'),
    contracts: { creators: CREATOR_ROW },
  }) {
    const prisma = {
      creators: { findUnique: vi.fn() },
      contents: { findUnique: vi.fn().mockResolvedValue(found) },
      contracts: { findUnique: vi.fn().mockResolvedValue({ creators: CREATOR_ROW }) },
    } satisfies CreatorEmailClient;
    const notifier = { notify: vi.fn<(event: EmailEvent) => Promise<void>>().mockResolvedValue() };
    return { prisma, notifier, emails: new CreatorEmails(prisma, notifier, { warn: vi.fn() }) };
  }

  it('reads the content with its name, deadline and creator', async () => {
    const { prisma, emails } = contentSetup();

    await emails.draftApproved({ contentId: CONTENT, submissionId: 'sub-1' });

    expect(prisma.contents.findUnique).toHaveBeenCalledWith({
      where: { id: CONTENT },
      select: {
        name: true,
        deadline: true,
        contracts: {
          select: {
            creators: {
              select: {
                first_name: true,
                middle_name: true,
                last_name: true,
                users: { select: { email: true } },
              },
            },
          },
        },
      },
    });
  });

  it.each([
    ['revisionRequested', { contentId: CONTENT, submissionId: 'sub-1' }, 'revision_requested:sub-1', 'revision_requested', { contentId: CONTENT, contentName: 'Promo Lebaran' }],
    ['followUpAdded', { contentId: CONTENT, followUpId: 'fu-1' }, 'follow_up_added:fu-1', 'follow_up_added', { contentId: CONTENT, contentName: 'Promo Lebaran' }],
    ['draftApproved', { contentId: CONTENT, submissionId: 'sub-1' }, 'draft_approved:sub-1', 'draft_approved', { contentId: CONTENT, contentName: 'Promo Lebaran' }],
    ['contentRescheduled', { contentId: CONTENT, deadline: '2026-11-25' }, `content_rescheduled:${CONTENT}:2026-11-25`, 'content_rescheduled', { contentId: CONTENT, contentName: 'Promo Lebaran', deadline: '2026-11-25' }],
  ] as const)('sends %s once per event', async (method, input, eventKey, template, data) => {
    const { notifier, emails } = contentSetup();

    await (emails[method] as (value: typeof input) => Promise<void>)(input);

    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({ eventKey, template, to: TO, data });
  });

  it('sends nothing for content that no longer exists', async () => {
    const { notifier, emails } = contentSetup(null);

    await emails.revisionRequested({ contentId: CONTENT, submissionId: 'sub-1' });

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('sends nothing for content whose contract has no creator', async () => {
    const { notifier, emails } = contentSetup({
      name: 'Promo',
      deadline: new Date('2026-11-25T00:00:00.000Z'),
      contracts: { creators: null },
    });

    await emails.draftApproved({ contentId: CONTENT, submissionId: 'sub-1' });

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  // The content row is gone by then, so the service hands over what it read and the contract.
  it('sends the deleted content email, finding the creator by the contract', async () => {
    const { prisma, notifier, emails } = contentSetup();

    await emails.contentDeleted({
      contractId: 'contract-1',
      contentId: CONTENT,
      contentName: 'Promo Lebaran',
      deadline: '2026-11-25',
    });

    expect(prisma.contracts.findUnique).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      select: {
        creators: {
          select: {
            first_name: true,
            middle_name: true,
            last_name: true,
            users: { select: { email: true } },
          },
        },
      },
    });
    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: `content_deleted:${CONTENT}`,
      template: 'content_deleted',
      to: TO,
      data: { contentName: 'Promo Lebaran', deadline: '2026-11-25' },
    });
  });

  it('never throws when the content cannot be read', async () => {
    const { prisma, notifier, emails } = contentSetup();
    prisma.contents.findUnique.mockRejectedValue(new TypeError('connection lost'));

    await expect(
      emails.followUpAdded({ contentId: CONTENT, followUpId: 'fu-1' }),
    ).resolves.toBeUndefined();
    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
