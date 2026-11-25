import { Inject, Injectable, Logger } from '@nestjs/common';
import { joinName } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_LOG } from './email-log.token.js';
import { EmailNotifier, errorKind, type EmailEvent } from './email-notifier.js';

// The creator's side of PBI-11 (11.1): each service says what happened to which creator, and this
// adapter finds the address and name, names the event and hands it to the helper. A service never
// learns how an email is built or sent (Adapter, SRP).

const CREATOR_SELECT = {
  first_name: true,
  middle_name: true,
  last_name: true,
  users: { select: { email: true } },
} as const;

interface CreatorRow {
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  users: { email: string };
}

/** The slice of Prisma the adapter reads, so tests hand in a stub of just that. */
export interface CreatorEmailClient {
  creators: {
    findUnique(args: {
      where: { id: string };
      select: typeof CREATOR_SELECT;
    }): Promise<CreatorRow | null>;
  };
}

@Injectable()
export class CreatorEmails {
  constructor(
    @Inject(PrismaService) private readonly prisma: CreatorEmailClient,
    // Only that the email was tried matters here: its answer is the run's business, not the service's.
    @Inject(EmailNotifier) private readonly notifier: { notify(event: EmailEvent): Promise<unknown> },
    @Inject(EMAIL_LOG) private readonly log: Pick<Logger, 'warn'>,
  ) {}

  /** AC 1: Admin scheduled new content for the creator. */
  contentScheduled(input: {
    creatorId: string;
    contentId: string;
    contentName: string;
    deadline: string;
  }): Promise<void> {
    const { creatorId, contentId, contentName, deadline } = input;
    return this.send(creatorId, {
      eventKey: `content_scheduled:${contentId}`,
      template: 'content_scheduled',
      data: { contentId, contentName, deadline },
    });
  }

  /** AC 1: Admin rejected the creator's proposal, with the reason they gave. */
  proposalRejected(input: {
    creatorId: string;
    contentId: string;
    contentName: string;
    reason: string | null;
  }): Promise<void> {
    const { creatorId, contentId, contentName, reason } = input;
    return this.send(creatorId, {
      eventKey: `proposal_rejected:${contentId}`,
      template: 'proposal_rejected',
      data: { contentName, reason },
    });
  }

  private async send(creatorId: string, event: Omit<EmailEvent, 'to'>): Promise<void> {
    let creator: CreatorRow | null;
    try {
      creator = await this.prisma.creators.findUnique({
        where: { id: creatorId },
        select: CREATOR_SELECT,
      });
    } catch (error) {
      // AC 9: the action is already saved, so this is logged, never thrown at it.
      this.log.warn(`Email ${event.template} failed (${errorKind(error)})`);
      return;
    }
    if (!creator) return;

    await this.notifier.notify({
      ...event,
      to: { email: creator.users.email, name: joinName(creator) },
    });
  }
}
