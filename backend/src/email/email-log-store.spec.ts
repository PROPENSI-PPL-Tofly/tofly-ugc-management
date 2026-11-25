import {
  MAX_EMAIL_ATTEMPTS,
  PrismaEmailLogStore,
  type EmailLogClient,
} from './email-log-store.js';

const AT = new Date('2026-11-25T01:00:00.000Z');

function client(created = 1) {
  return {
    email_log: {
      createMany: vi.fn().mockResolvedValue({ count: created }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
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

    await expect(new PrismaEmailLogStore(prisma).failedToRetry()).resolves.toEqual([
      {
        eventKey: 'e1',
        template: 'content_scheduled',
        recipient: 'salsa@example.com',
        payload: { contentName: 'Evg_1' },
      },
    ]);
    expect(prisma.email_log.findMany).toHaveBeenCalledWith({
      where: { status: 'failed', attempts: { lt: 3 } },
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
