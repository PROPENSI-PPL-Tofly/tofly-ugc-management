import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { jakartaDay, joinName } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_LOG_STORE, type EmailLogStore, type LoggedEmail } from './email-log-store.js';
import { EmailNotifier, type EmailEvent } from './email-notifier.js';

// The daily 08:00 WIB email run of PBI-11 (11.3), started by Cloud Scheduler: it first reminds
// each creator of content due tomorrow that has no link yet (AC 2), then tries the failed emails
// again (AC 9, up to 3 attempts in total). Both go through the helper, so the unique event key
// keeps a second run that day from sending anything twice (AC 8).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Lets a test fix the run's moment; the app leaves it unbound and runs on the current time. */
export const DAILY_EMAIL_CLOCK = Symbol('DAILY_EMAIL_CLOCK');

const DUE_CONTENT = {
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
} as const;

interface DueContent {
  id: string;
  name: string;
  deadline: Date;
  contracts: {
    creators: {
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
      users: { email: string };
    } | null;
  };
}

/** The slice of Prisma the run reads, so tests hand in a stub of just that. */
export interface DailyEmailClient {
  contents: {
    findMany(args: {
      where: Prisma.contentsWhereInput;
      select: typeof DUE_CONTENT;
      orderBy: Prisma.contentsOrderByWithRelationInput[];
    }): Promise<DueContent[]>;
  };
  users: {
    findUnique(args: {
      where: { email: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

/** What one run did, answered to Cloud Scheduler and kept in the request log. */
export interface DailyEmailReport {
  retried: number;
  resent: number;
  reminded: number;
}

/** Tomorrow's calendar day in Jakarta, as Postgres stores a `date` (midnight UTC). */
function tomorrowInJakarta(now: Date): Date {
  return new Date(Date.parse(`${jakartaDay(now)}T00:00:00Z`) + MS_PER_DAY);
}

@Injectable()
export class DailyEmailRun {
  constructor(
    @Inject(PrismaService) private readonly prisma: DailyEmailClient,
    @Inject(EmailNotifier)
    private readonly notifier: {
      notify(event: EmailEvent): Promise<boolean>;
      retry(email: LoggedEmail): Promise<boolean>;
    },
    @Inject(EMAIL_LOG_STORE)
    private readonly store: Pick<EmailLogStore, 'failedToRetry' | 'stuckSending' | 'abandon'>,
    @Optional()
    @Inject(DAILY_EMAIL_CLOCK)
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(): Promise<DailyEmailReport> {
    const now = this.clock();
    // Review on #253 (Kak Satria, AC 8): the mail server may have accepted a row left sending, as
    // with a timeout, so it is closed rather than sent a second time.
    for (const email of await this.store.stuckSending(now)) {
      await this.store.abandon(email.eventKey, email.recipient, 'UnknownOutcome', now);
    }
    // Read before reminding, so a reminder that fails this morning waits for tomorrow's run.
    const failed = await this.store.failedToRetry(now);
    // Review on #253 (Kak Satria, AC 2): reminders first, since a slow mail server can use up the
    // run's time, and a reminder cannot wait for tomorrow while a retry can.
    const reminded = await this.remind(now);
    let retried = 0;
    let resent = 0;
    for (const email of failed) {
      // Review on #253 (Gunta): an address that no longer belongs to anyone (the creator's email
      // was changed) is never written to again.
      if (!(await this.stillSomeones(email.recipient))) {
        await this.store.abandon(email.eventKey, email.recipient, 'RecipientGone', now);
        continue;
      }
      retried += 1;
      if (await this.notifier.retry(email)) resent += 1;
    }

    return { retried, resent, reminded };
  }

  private async stillSomeones(email: string): Promise<boolean> {
    const user = await this.prisma.users.findUnique({ where: { email }, select: { id: true } });
    return user !== null;
  }

  /** AC 2: one reminder per content due tomorrow with no link yet; closed content is left out. */
  private async remind(now: Date): Promise<number> {
    const due = await this.prisma.contents.findMany({
      where: {
        deadline: tomorrowInJakarta(now),
        status: { not: 'link_submitted' },
        closed_at: null,
      },
      select: DUE_CONTENT,
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
    });

    let reminded = 0;
    for (const content of due) {
      const creator = content.contracts.creators;
      if (!creator) continue;
      const deadline = content.deadline.toISOString().slice(0, 10);
      const sent = await this.notifier.notify({
        // The deadline is in the key, so content moved to another day is reminded again.
        eventKey: `deadline_reminder:${content.id}:${deadline}`,
        template: 'deadline_reminder',
        to: { email: creator.users.email, name: joinName(creator) },
        data: { contentId: content.id, contentName: content.name, deadline },
      });
      // Review on #253 (Davin): counted once it went out, not when it was only tried.
      if (sent) reminded += 1;
    }
    return reminded;
  }
}
