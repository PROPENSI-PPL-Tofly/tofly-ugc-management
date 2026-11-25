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
} = {}) {
  const prisma = {
    contents: { findMany: vi.fn().mockResolvedValue(due) },
  } satisfies DailyEmailClient;
  const notifier = {
    notify: vi.fn<(event: EmailEvent) => Promise<void>>().mockResolvedValue(),
    retry: vi.fn<(email: LoggedEmail) => Promise<boolean>>().mockResolvedValue(resent),
  };
  const store = { failedToRetry: vi.fn<() => Promise<LoggedEmail[]>>().mockResolvedValue(failed) };
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

    await expect(run.run()).resolves.toEqual({ retried: 2, resent: 0, reminded: 2 });
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
