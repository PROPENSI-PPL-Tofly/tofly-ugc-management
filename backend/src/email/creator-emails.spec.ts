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

// PBI-11 (11.2, AC 1 and AC 4): account, period, early end and proposal events.
describe('CreatorEmails, account, contract and proposal events', () => {
  const CREATOR_ROW = {
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    users: { email: 'rangga@example.com' },
  };
  const TO = { email: 'rangga@example.com', name: 'Rangga Pratama' };

  function eventSetup() {
    const prisma = {
      creators: { findUnique: vi.fn().mockResolvedValue(CREATOR_ROW) },
      contents: {
        findUnique: vi.fn().mockResolvedValue({
          name: 'Ide konten',
          deadline: new Date('2026-12-01T00:00:00.000Z'),
          contracts: { creators: CREATOR_ROW },
        }),
      },
      contracts: { findUnique: vi.fn() },
    } satisfies CreatorEmailClient;
    const notifier = { notify: vi.fn<(event: EmailEvent) => Promise<void>>().mockResolvedValue() };
    return { notifier, emails: new CreatorEmails(prisma, notifier, { warn: vi.fn() }) };
  }

  it('sends the account ready email once per creator', async () => {
    const { notifier, emails } = eventSetup();

    await emails.accountReady({ creatorId: CREATOR });

    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: `account_ready:${CREATOR}`,
      template: 'account_ready',
      to: TO,
      data: {},
    });
  });

  it('sends the new period email once per period', async () => {
    const { notifier, emails } = eventSetup();

    await emails.periodAdded({
      creatorId: CREATOR,
      contractId: 'contract-2',
      startDate: '2027-01-01',
      endDate: '2027-03-31',
    });

    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: 'period_added:contract-2',
      template: 'period_added',
      to: TO,
      data: { contractId: 'contract-2', startDate: '2027-01-01', endDate: '2027-03-31' },
    });
  });

  // AC 4 and AC 10: the last day and the invoice choice, never the reason type or note.
  it('sends the early end email with the last day and the invoice choice only', async () => {
    const { notifier, emails } = eventSetup();

    await emails.contractEndedEarly({
      creatorId: CREATOR,
      contractId: 'contract-1',
      lastDay: '2026-11-30',
      invoice: 'cancelled',
    });

    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: 'contract_ended_early:contract-1',
      template: 'contract_ended_early',
      to: TO,
      data: { contractId: 'contract-1', lastDay: '2026-11-30', invoice: 'cancelled' },
    });
  });

  it.each([
    ['proposalApproved', 'proposal_approved'],
    ['proposalScheduled', 'proposal_scheduled'],
  ] as const)('sends %s once per proposal', async (method, template) => {
    const { notifier, emails } = eventSetup();

    await emails[method]({ contentId: CONTENT });

    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: `${template}:${CONTENT}`,
      template,
      to: TO,
      data: { contentId: CONTENT, contentName: 'Ide konten' },
    });
  });
});

// PBI-11 (11.2, AC 1): invoice events, found by the contract the invoice belongs to.
describe('CreatorEmails, invoice events', () => {
  const CREATOR_ROW = {
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    users: { email: 'rangga@example.com' },
  };

  it.each([
    ['invoiceFinalized', 'invoice_finalized'],
    ['paymentProofUploaded', 'payment_proof_uploaded'],
  ] as const)('sends %s once per invoice', async (method, template) => {
    const prisma = {
      creators: { findUnique: vi.fn() },
      contents: { findUnique: vi.fn() },
      contracts: { findUnique: vi.fn().mockResolvedValue({ creators: CREATOR_ROW }) },
    } satisfies CreatorEmailClient;
    const notifier = { notify: vi.fn<(event: EmailEvent) => Promise<void>>().mockResolvedValue() };

    await new CreatorEmails(prisma, notifier, { warn: vi.fn() })[method]({ contractId: 'contract-1' });

    expect(prisma.contracts.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contract-1' } }),
    );
    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: `${template}:contract-1`,
      template,
      to: { email: 'rangga@example.com', name: 'Rangga Pratama' },
      data: { contractId: 'contract-1' },
    });
  });
});

describe('CreatorEmails, a contract that is gone', () => {
  it('sends nothing for an invoice whose contract no longer exists', async () => {
    const prisma = {
      creators: { findUnique: vi.fn() },
      contents: { findUnique: vi.fn() },
      contracts: { findUnique: vi.fn().mockResolvedValue(null) },
    } satisfies CreatorEmailClient;
    const notifier = { notify: vi.fn<(event: EmailEvent) => Promise<void>>().mockResolvedValue() };

    await new CreatorEmails(prisma, notifier, { warn: vi.fn() }).invoiceFinalized({
      contractId: 'contract-gone',
    });

    expect(notifier.notify).not.toHaveBeenCalled();
  });
});

// PBI-11 (11.2, AC 1 and AC 3): the Paid email, with the day access closes when it is the last.
describe('CreatorEmails, the Paid email', () => {
  function paidSetup(contracts: unknown[]) {
    const prisma = {
      creators: {
        findUnique: vi.fn().mockResolvedValue({
          first_name: 'Rangga',
          middle_name: null,
          last_name: 'Pratama',
          users: { email: 'rangga@example.com' },
          contracts,
        }),
      },
      contents: { findUnique: vi.fn() },
      contracts: { findUnique: vi.fn() },
    } satisfies CreatorEmailClient;
    const notifier = { notify: vi.fn<(event: EmailEvent) => Promise<void>>().mockResolvedValue() };
    return { prisma, notifier, emails: new CreatorEmails(prisma, notifier, { warn: vi.fn() }) };
  }
  const PAID_AT = new Date('2026-11-25T03:00:00.000Z');

  it('reads the creator with every contract and its invoice, for the access rule', async () => {
    const { prisma, emails } = paidSetup([]);

    await emails.invoicePaid({ creatorId: CREATOR, contractId: 'contract-1', paidAt: PAID_AT });

    expect(prisma.creators.findUnique).toHaveBeenCalledWith({
      where: { id: CREATOR },
      select: {
        first_name: true,
        middle_name: true,
        last_name: true,
        users: { select: { email: true } },
        contracts: {
          select: { end_date: true, invoice: { select: { status: true, paid_at: true } } },
        },
      },
    });
  });

  it('sends the Paid email once per invoice, naming the day access closes on the last one', async () => {
    const { notifier, emails } = paidSetup([
      {
        end_date: new Date('2026-11-20T00:00:00.000Z'),
        invoice: { status: 'paid', paid_at: PAID_AT },
      },
    ]);

    await emails.invoicePaid({ creatorId: CREATOR, contractId: 'contract-1', paidAt: PAID_AT });

    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: 'invoice_paid:contract-1',
      template: 'invoice_paid',
      to: { email: 'rangga@example.com', name: 'Rangga Pratama' },
      data: { contractId: 'contract-1', accessClosesOn: '2026-11-26' },
    });
  });

  it('names no day while another period keeps access open', async () => {
    const { notifier, emails } = paidSetup([
      { end_date: new Date('2026-11-20T00:00:00.000Z'), invoice: { status: 'paid', paid_at: PAID_AT } },
      { end_date: new Date('2027-02-28T00:00:00.000Z'), invoice: { status: 'running', paid_at: null } },
    ]);

    await emails.invoicePaid({ creatorId: CREATOR, contractId: 'contract-1', paidAt: PAID_AT });

    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ data: { contractId: 'contract-1', accessClosesOn: null } }),
    );
  });

  it('sends nothing for a creator who no longer exists', async () => {
    const { prisma, notifier, emails } = paidSetup([]);
    prisma.creators.findUnique.mockResolvedValue(null);

    await emails.invoicePaid({ creatorId: CREATOR, contractId: 'contract-1', paidAt: PAID_AT });

    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
