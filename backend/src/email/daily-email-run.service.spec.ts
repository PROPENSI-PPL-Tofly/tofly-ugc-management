import { Logger } from '@nestjs/common';
import type { LoggedEmail } from './email-log-store.js';
import type { EmailEvent } from './email-notifier.js';
import { DailyEmailRun, type DailyEmailClient } from './daily-email-run.service.js';

// 01:00 UTC is 08:00 WIB on 25 Nov, when Cloud Scheduler starts the run.
const NOW = new Date('2026-11-25T01:00:00.000Z');

const CONTENT = '33333333-3333-4333-8333-333333333333';

function content(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTENT,
    name: 'Evg_1_Salsa_2026-11-26',
    deadline: new Date('2026-11-26T00:00:00.000Z'),
    contracts: {
      creators: {
        first_name: 'Salsa',
        middle_name: null,
        last_name: 'Amelia',
        users: { email: 'salsa@example.com' },
      },
    },
    ...overrides,
  };
}

function setup({
  failed = [] as LoggedEmail[],
  due = [content()] as unknown[],
  resent = true,
  closed = 0,
} = {}) {
  const prisma = {
    contents: { findMany: vi.fn().mockResolvedValue(due) },
    users: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }) },
  } satisfies DailyEmailClient;
  const notifier = {
    notify: vi.fn<(event: EmailEvent) => Promise<boolean>>().mockResolvedValue(true),
    retry: vi.fn<(email: LoggedEmail) => Promise<boolean>>().mockResolvedValue(resent),
  };
  const store = {
    failedToRetry: vi.fn<(at: Date) => Promise<LoggedEmail[]>>().mockResolvedValue(failed),
    closeStuckSending: vi.fn<(at: Date) => Promise<number>>().mockResolvedValue(closed),
    abandon: vi.fn<(eventKey: string, recipient: string, reason: string, at: Date) => Promise<void>>()
      .mockResolvedValue(),
  };
  return { prisma, notifier, store, run: new DailyEmailRun(prisma, notifier, store, () => NOW) };
}

const FAILED: LoggedEmail = {
  eventKey: 'content_scheduled:c1',
  template: 'content_scheduled',
  recipient: 'salsa@example.com',
  payload: { contentName: 'Evg_1' },
};

describe('DailyEmailRun', () => {
  // AC 9: the 08:00 run tries every failed email again while it has attempts left.
  it('sends every failed email with attempts left again', async () => {
    const second = { ...FAILED, eventKey: 'proposal_rejected:c2', template: 'proposal_rejected' };
    const { notifier, run } = setup({ failed: [FAILED, second], due: [] });

    await run.run();

    expect(notifier.retry.mock.calls.map(([email]) => email)).toEqual([FAILED, second]);
  });

  // AC 2: at 08:00 WIB on H-1, every content item with no link yet gets a reminder.
  it('reads the content due tomorrow in Jakarta that has no link and is not closed', async () => {
    const { prisma, run } = setup();

    await run.run();

    expect(prisma.contents.findMany).toHaveBeenCalledWith({
      where: {
        deadline: new Date('2026-11-26T00:00:00.000Z'),
        status: { not: 'link_submitted' },
        closed_at: null,
      },
      select: {
        id: true,
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
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
    });
  });

  it('takes tomorrow from the Jakarta day, not the UTC one', async () => {
    // 17:30 UTC on 25 Nov is already 00:30 WIB on 26 Nov.
    const { prisma } = setup();
    await new DailyEmailRun(
      prisma,
      setup().notifier,
      setup().store,
      () => new Date('2026-11-25T17:30:00.000Z'),
    ).run();

    expect(prisma.contents.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deadline: new Date('2026-11-27T00:00:00.000Z') }),
      }),
    );
  });

  // AC 8: one reminder per content and deadline, so a second run that day sends nothing again,
  // while a moved deadline gets its own reminder.
  it('reminds the creator once per content and deadline', async () => {
    const { notifier, run } = setup();

    await run.run();

    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith({
      eventKey: `deadline_reminder:${CONTENT}:2026-11-26`,
      template: 'deadline_reminder',
      to: { email: 'salsa@example.com', name: 'Salsa Amelia' },
      data: { contentId: CONTENT, contentName: 'Evg_1_Salsa_2026-11-26', deadline: '2026-11-26' },
    });
  });

  it('skips content whose contract has no creator', async () => {
    const { notifier, run } = setup({ due: [content({ contracts: { creators: null } })] });

    await run.run();

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('reports how many failed emails it tried, how many went out, and how many reminders', async () => {
    const { run } = setup({ failed: [FAILED, FAILED], due: [content(), content()], resent: false });

    await expect(run.run()).resolves.toEqual({ retried: 2, resent: 0, reminded: 2, closed: 0 });
  });

  it('runs on the current time when no clock is given', async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const { prisma, notifier, store } = setup();
      await new DailyEmailRun(prisma, notifier, store).run();

      expect(prisma.contents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deadline: new Date('2026-11-26T00:00:00.000Z') }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

// Review on #253: what the run tries again, and what its report counts.
describe('DailyEmailRun, review follow-ups', () => {
  it('reads the retryable rows as of the run, so stale pending rows count from now', async () => {
    const { store, run } = setup({ due: [] });

    await run.run();

    expect(store.failedToRetry).toHaveBeenCalledWith(NOW);
  });

  // Gunta: the creator's address changed (PBI-16), so the old one is never written to again.
  it('closes a failed email whose address no longer belongs to anyone, sending nothing', async () => {
    const { prisma, notifier, store, run } = setup({ failed: [FAILED], due: [] });
    prisma.users.findUnique.mockResolvedValue(null);

    await expect(run.run()).resolves.toEqual({ retried: 0, resent: 0, reminded: 0, closed: 0 });

    expect(prisma.users.findUnique).toHaveBeenCalledWith({
      where: { email: 'salsa@example.com' },
      select: { id: true },
    });
    expect(store.abandon).toHaveBeenCalledWith(FAILED.eventKey, FAILED.recipient, 'RecipientGone', NOW);
    expect(notifier.retry).not.toHaveBeenCalled();
  });

  // Kak Satria (AC 8): a row left sending may have gone out, like a timeout, so it is closed.
  it('closes the emails left sending for 30 minutes as UnknownOutcome, never sending them again', async () => {
    const { notifier, store, run } = setup({ closed: 2, due: [] });

    await run.run();

    expect(store.closeStuckSending).toHaveBeenCalledWith(NOW);
    expect(notifier.retry).not.toHaveBeenCalled();
  });

  // Review on #264 (Kak Satria, OWASP A09): an email that may not have reached its creator shows in
  // the run's answer and in the log, so it can be checked by hand.
  it('reports and logs how many emails it closed as UnknownOutcome', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { run } = setup({ closed: 2, due: [] });

    await expect(run.run()).resolves.toEqual({ retried: 0, resent: 0, reminded: 0, closed: 2 });

    expect(warn).toHaveBeenCalledWith('2 email(s) closed as UnknownOutcome; check them by hand');
    warn.mockRestore();
  });

  it('logs nothing when no email was left sending', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { run } = setup({ due: [] });

    await run.run();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // Kak Satria (AC 2): a slow mail server can use up the run's time, and a reminder cannot wait
  // for tomorrow while a retry can.
  it('sends the H-1 reminders before trying failed emails again', async () => {
    const { notifier, run } = setup({ failed: [FAILED] });

    await run.run();

    expect(notifier.notify.mock.invocationCallOrder[0]).toBeLessThan(
      notifier.retry.mock.invocationCallOrder[0],
    );
  });

  it('reads what to retry before reminding, so a reminder failing now is not retried at once', async () => {
    const { notifier, store, run } = setup({ failed: [FAILED] });

    await run.run();

    expect(store.failedToRetry.mock.invocationCallOrder[0]).toBeLessThan(
      notifier.notify.mock.invocationCallOrder[0],
    );
  });

  // Davin: a reminder counts only once it went out.
  it('counts only the reminders that went out', async () => {
    const { notifier, run } = setup({ due: [content(), content({ id: 'other' })] });
    notifier.notify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(run.run()).resolves.toMatchObject({ reminded: 1 });
  });
});
