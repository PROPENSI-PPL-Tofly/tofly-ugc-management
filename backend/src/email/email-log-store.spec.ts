import {
  MAX_EMAIL_ATTEMPTS,
  PrismaEmailLogStore,
  type EmailLogClient,
} from './email-log-store.js';

const AT = new Date('2026-11-25T01:00:00.000Z');

// Review on #253: failed with attempts left, or pending and untouched for 30 minutes (a send cut
// off by a crash, Gunta), never a send that timed out, which may have gone out late (Davin).
const RETRYABLE = {
  attempts: { lt: 3 },
  AND: [
    {
      OR: [
        { status: 'failed' },
        { status: 'pending', updated_at: { lt: new Date('2026-11-25T00:30:00.000Z') } },
      ],
    },
    { OR: [{ last_error: null }, { last_error: { not: 'EmailTimeout' } }] },
  ],
};

function client(created = 1) {
  return {
    email_log: {
      createMany: vi.fn().mockResolvedValue({ count: created }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } satisfies EmailLogClient;
}

// PBI-11 (11.3, AC 9): up to 3 attempts in total, so a row on its third failure stays failed.
describe('PrismaEmailLogStore.failedToRetry', () => {
  it('allows 3 attempts in total', () => {
    expect(MAX_EMAIL_ATTEMPTS).toBe(3);
  });

  it('reads the failed emails with attempts left, oldest first, with what a retry needs', async () => {
    const prisma = client();
    prisma.email_log.findMany.mockResolvedValue([
      {
        event_key: 'e1',
        template: 'content_scheduled',
        recipient: 'salsa@example.com',
        payload: { contentName: 'Evg_1' },
      },
    ]);

    await expect(new PrismaEmailLogStore(prisma).failedToRetry(AT)).resolves.toEqual([
      {
        eventKey: 'e1',
        template: 'content_scheduled',
        recipient: 'salsa@example.com',
        payload: { contentName: 'Evg_1' },
      },
    ]);
    expect(prisma.email_log.findMany).toHaveBeenCalledWith({
      where: RETRYABLE,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { event_key: true, template: true, recipient: true, payload: true },
    });
  });
});

const KEY = { event_key_recipient: { event_key: 'e1', recipient: 'salsa@example.com' } };

describe('PrismaEmailLogStore', () => {
  it('logs a new email as pending and answers that it may be sent', async () => {
    const prisma = client(1);

    await expect(
      new PrismaEmailLogStore(prisma).claim({
        eventKey: 'e1',
        template: 'content_scheduled',
        recipient: 'salsa@example.com',
        payload: { contentName: 'Evg_1' },
      }),
    ).resolves.toBe(true);

    expect(prisma.email_log.createMany).toHaveBeenCalledWith({
      data: [
        {
          event_key: 'e1',
          template: 'content_scheduled',
          recipient: 'salsa@example.com',
          payload: { contentName: 'Evg_1' },
        },
      ],
      skipDuplicates: true,
    });
  });

  // AC 8: the unique key turns a second claim into nothing, even from two requests at once.
  it('answers that an email already logged for the event and recipient may not be sent', async () => {
    await expect(
      new PrismaEmailLogStore(client(0)).claim({
        eventKey: 'e1',
        template: 'content_scheduled',
        recipient: 'salsa@example.com',
        payload: {},
      }),
    ).resolves.toBe(false);
  });

  it('marks an email sent, counting the attempt and clearing an earlier error', async () => {
    const prisma = client();

    await new PrismaEmailLogStore(prisma).markSent('e1', 'salsa@example.com', AT);

    expect(prisma.email_log.update).toHaveBeenCalledWith({
      where: KEY,
      data: {
        status: 'sent',
        attempts: { increment: 1 },
        last_error: null,
        sent_at: AT,
        updated_at: AT,
      },
    });
  });

  it('marks an email failed, counting the attempt and keeping the error kind', async () => {
    const prisma = client();

    await new PrismaEmailLogStore(prisma).markFailed('e1', 'salsa@example.com', 'SmtpError', AT);

    expect(prisma.email_log.update).toHaveBeenCalledWith({
      where: KEY,
      data: {
        status: 'failed',
        attempts: { increment: 1 },
        last_error: 'SmtpError',
        updated_at: AT,
      },
    });
  });
});

// Review on #252 (Davin): a send that was never attempted keeps its attempts.
describe('PrismaEmailLogStore.markNotReady', () => {
  it('marks the email failed as not ready, without counting an attempt', async () => {
    const prisma = client();

    await new PrismaEmailLogStore(prisma).markNotReady('e1', 'salsa@example.com', AT);

    expect(prisma.email_log.update).toHaveBeenCalledWith({
      where: KEY,
      data: { status: 'failed', last_error: 'PortNotReady', updated_at: AT },
    });
  });
});

// Review on #253 (Davin, Gunta): a retry claims its row first, so two runs at once send it once.
describe('PrismaEmailLogStore.claimRetry', () => {
  const EMAIL = {
    eventKey: 'e1',
    template: 'content_scheduled',
    recipient: 'salsa@example.com',
    payload: {},
  };

  it('moves a retryable row to pending in one guarded update, and answers that it won', async () => {
    const prisma = client();

    await expect(new PrismaEmailLogStore(prisma).claimRetry(EMAIL, AT)).resolves.toBe(true);

    expect(prisma.email_log.updateMany).toHaveBeenCalledWith({
      where: { event_key: 'e1', recipient: 'salsa@example.com', ...RETRYABLE },
      data: { status: 'pending', updated_at: AT },
    });
  });

  it('answers that another run already claimed it', async () => {
    const prisma = client();
    prisma.email_log.updateMany.mockResolvedValue({ count: 0 });

    await expect(new PrismaEmailLogStore(prisma).claimRetry(EMAIL, AT)).resolves.toBe(false);
  });
});

// Review on #253 (Gunta): an email whose address no longer belongs to anyone is not sent again.
describe('PrismaEmailLogStore.abandon', () => {
  it('closes the row with every attempt used and the reason', async () => {
    const prisma = client();

    await new PrismaEmailLogStore(prisma).abandon('e1', 'salsa@example.com', 'RecipientGone', AT);

    expect(prisma.email_log.update).toHaveBeenCalledWith({
      where: KEY,
      data: { status: 'failed', attempts: 3, last_error: 'RecipientGone', updated_at: AT },
    });
  });
});
