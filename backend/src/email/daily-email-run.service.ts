import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { jakartaDay, joinName } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_LOG_STORE, type EmailLogStore, type LoggedEmail } from './email-log-store.js';
import { EmailNotifier, type EmailEvent } from './email-notifier.js';

// The daily 08:00 WIB email run of PBI-11 (11.3), started by Cloud Scheduler: it first tries the
// failed emails again (AC 9, up to 3 attempts in total), then reminds each creator of content due
// tomorrow that has no link yet (AC 2). Both go through the helper, so the unique event key keeps
// a second run that day from sending anything twice (AC 8).

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
      notify(event: EmailEvent): Promise<void>;
      retry(email: LoggedEmail): Promise<boolean>;
    },
    @Inject(EMAIL_LOG_STORE) private readonly store: Pick<EmailLogStore, 'failedToRetry'>,
    @Optional()
    @Inject(DAILY_EMAIL_CLOCK)
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(): Promise<DailyEmailReport> {
    const failed = await this.store.failedToRetry();
    let resent = 0;
    for (const email of failed) {
      if (await this.notifier.retry(email)) resent += 1;
    }

    return { retried: failed.length, resent, reminded: await this.remind() };
  }

  /** AC 2: one reminder per content due tomorrow with no link yet; closed content is left out. */
  private async remind(): Promise<number> {
    const due = await this.prisma.contents.findMany({
      where: {
        deadline: tomorrowInJakarta(this.clock()),
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
      await this.notifier.notify({
        // The deadline is in the key, so content moved to another day is reminded again.
        eventKey: `deadline_reminder:${content.id}:${deadline}`,
        template: 'deadline_reminder',
        to: { email: creator.users.email, name: joinName(creator) },
        data: { contentId: content.id, contentName: content.name, deadline },
      });
      reminded += 1;
    }
    return reminded;
  }
}
