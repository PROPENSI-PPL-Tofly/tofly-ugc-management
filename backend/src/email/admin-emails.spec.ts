import type { EmailEvent, EmailRecipient } from './email-notifier.js';
import { AdminEmails, type AdminEmailClient } from './admin-emails.js';

const CONTENT = '22222222-2222-4222-8222-222222222222';
const CREATOR_NAMES = { first_name: 'Rangga', middle_name: null, last_name: 'Pratama' };

type AllEvent = Omit<EmailEvent, 'to'> & { to: readonly EmailRecipient[] };

function setup(admins: { email: string }[] = [{ email: 'rina@tofly.id' }, { email: 'budi@tofly.id' }]) {
  const prisma = {
    users: { findMany: vi.fn().mockResolvedValue(admins) },
    contents: {
      findUnique: vi.fn().mockResolvedValue({
        name: 'Promo Lebaran',
        contracts: { creators: CREATOR_NAMES },
      }),
    },
    contracts: { findUnique: vi.fn().mockResolvedValue({ creators: CREATOR_NAMES }) },
  } satisfies AdminEmailClient;
  const notifier = { notifyAll: vi.fn<(event: AllEvent) => Promise<void>>().mockResolvedValue() };
  const log = { warn: vi.fn() };
  return { prisma, notifier, log, emails: new AdminEmails(prisma, notifier, log) };
}

// PBI-11 (11.2, AC 5): every Admin hears when a creator hands in a draft or acknowledges an invoice.
describe('AdminEmails', () => {
  // Admins cannot be deactivated on this branch yet; once PBI-23's status is here, only the
  // active ones are read (the one place to add it).
  it('reads every Admin, in a stable order', async () => {
    const { prisma, emails } = setup();

    await emails.invoiceAcknowledged({ contractId: 'contract-1' });

    expect(prisma.users.findMany).toHaveBeenCalledWith({
      where: { is_admin: true },
      select: { email: true },
      orderBy: { email: 'asc' },
    });
  });

  it('tells every Admin a draft waits for review, once per draft', async () => {
    const { prisma, notifier, emails } = setup();

    await emails.draftSubmitted({ contentId: CONTENT, submissionId: 'sub-1' });

    expect(prisma.contents.findUnique).toHaveBeenCalledWith({
      where: { id: CONTENT },
      select: {
        name: true,
        contracts: {
          select: { creators: { select: { first_name: true, middle_name: true, last_name: true } } },
        },
      },
    });
    // No Admin name exists on this branch, so the greeting uses the address (PBI-23 adds names).
    expect(notifier.notifyAll).toHaveBeenCalledExactlyOnceWith({
      eventKey: 'draft_submitted:sub-1',
      template: 'draft_submitted',
      to: [
        { email: 'rina@tofly.id', name: 'rina@tofly.id' },
        { email: 'budi@tofly.id', name: 'budi@tofly.id' },
      ],
      data: { contentId: CONTENT, contentName: 'Promo Lebaran', creatorName: 'Rangga Pratama' },
    });
  });

  it('tells every Admin a creator acknowledged the invoice, once per invoice', async () => {
    const { prisma, notifier, emails } = setup();

    await emails.invoiceAcknowledged({ contractId: 'contract-1' });

    expect(prisma.contracts.findUnique).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      select: { creators: { select: { first_name: true, middle_name: true, last_name: true } } },
    });
    expect(notifier.notifyAll).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        eventKey: 'invoice_acknowledged:contract-1',
        template: 'invoice_acknowledged',
        data: { contractId: 'contract-1', creatorName: 'Rangga Pratama' },
      }),
    );
  });

  it('sends nothing when there is no Admin', async () => {
    const { notifier, emails } = setup([]);

    await emails.invoiceAcknowledged({ contractId: 'contract-1' });

    expect(notifier.notifyAll).not.toHaveBeenCalled();
  });

  it.each([
    ['a content that no longer exists', 'contents'],
    ['a contract that no longer exists', 'contracts'],
  ] as const)('sends nothing for %s', async (_, table) => {
    const { prisma, notifier, emails } = setup();
    prisma[table].findUnique.mockResolvedValue(null);

    await emails.draftSubmitted({ contentId: CONTENT, submissionId: 'sub-1' });
    await emails.invoiceAcknowledged({ contractId: 'contract-1' });

    expect(notifier.notifyAll).toHaveBeenCalledTimes(1);
  });

  // AC 9: the creator's action is already saved, so a failed read is logged, never thrown.
  it('never throws when the Admins cannot be read', async () => {
    const { prisma, notifier, log, emails } = setup();
    prisma.users.findMany.mockRejectedValue(new TypeError('connection lost'));

    await expect(emails.invoiceAcknowledged({ contractId: 'contract-1' })).resolves.toBeUndefined();
    expect(notifier.notifyAll).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('Email invoice_acknowledged failed (TypeError)');
  });
});

describe('AdminEmails, a contract without a creator', () => {
  it('still tells every Admin, with no creator name', async () => {
    const { prisma, notifier, emails } = setup();
    prisma.contracts.findUnique.mockResolvedValue({ creators: null });

    await emails.invoiceAcknowledged({ contractId: 'contract-1' });

    expect(notifier.notifyAll).toHaveBeenCalledWith(
      expect.objectContaining({ data: { contractId: 'contract-1', creatorName: '' } }),
    );
  });
});
