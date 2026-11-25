import { Inject, Injectable, Logger } from '@nestjs/common';
import { joinName } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatorNotifier } from './creator-notifier.js';
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

const CONTENT_SELECT = {
  name: true,
  deadline: true,
  contracts: { select: { creators: { select: CREATOR_SELECT } } },
} as const;

interface ContentRow {
  name: string;
  deadline: Date;
  contracts: { creators: CreatorRow | null };
}

/** The slice of Prisma the adapter reads, so tests hand in a stub of just that. */
export interface CreatorEmailClient {
  creators: {
    findUnique(args: {
      where: { id: string };
      select: typeof CREATOR_SELECT;
    }): Promise<CreatorRow | null>;
  };
  contents: {
    findUnique(args: {
      where: { id: string };
      select: typeof CONTENT_SELECT;
    }): Promise<ContentRow | null>;
  };
  contracts: {
    findUnique(args: {
      where: { id: string };
      select: { creators: { select: typeof CREATOR_SELECT } };
    }): Promise<{ creators: CreatorRow | null } | null>;
  };
}

/** Who an email goes to and what it says, once the creator has been found. */
interface Addressed {
  creator: CreatorRow | null;
  event: Omit<EmailEvent, 'to'>;
}

@Injectable()
export class CreatorEmails implements CreatorNotifier {
  constructor(
    @Inject(PrismaService) private readonly prisma: CreatorEmailClient,
    @Inject(EmailNotifier) private readonly notifier: Pick<EmailNotifier, 'notify'>,
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
    return this.byCreator(creatorId, {
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
    return this.byCreator(creatorId, {
      eventKey: `proposal_rejected:${contentId}`,
      template: 'proposal_rejected',
      data: { contentName, reason },
    });
  }

  revisionRequested({ contentId, submissionId }: { contentId: string; submissionId: string }) {
    return this.byContent(contentId, 'revision_requested', submissionId);
  }

  followUpAdded({ contentId, followUpId }: { contentId: string; followUpId: string }) {
    return this.byContent(contentId, 'follow_up_added', followUpId);
  }

  draftApproved({ contentId, submissionId }: { contentId: string; submissionId: string }) {
    return this.byContent(contentId, 'draft_approved', submissionId);
  }

  /** The new deadline is in the key, so a second change later is its own email. */
  contentRescheduled({ contentId, deadline }: { contentId: string; deadline: string }) {
    return this.byContent(contentId, 'content_rescheduled', `${contentId}:${deadline}`, {
      deadline,
    });
  }

  contentDeleted(input: {
    contractId: string;
    contentId: string;
    contentName: string;
    deadline: string;
  }): Promise<void> {
    const { contractId, contentId, contentName, deadline } = input;
    return this.reach('content_deleted', async () => {
      const contract = await this.prisma.contracts.findUnique({
        where: { id: contractId },
        select: { creators: { select: CREATOR_SELECT } },
      });
      return {
        creator: contract?.creators ?? null,
        event: {
          eventKey: `content_deleted:${contentId}`,
          template: 'content_deleted',
          data: { contentName, deadline },
        },
      };
    });
  }

  private byCreator(creatorId: string, event: Omit<EmailEvent, 'to'>): Promise<void> {
    return this.reach(event.template, async () => ({
      creator: await this.prisma.creators.findUnique({
        where: { id: creatorId },
        select: CREATOR_SELECT,
      }),
      event,
    }));
  }

  /** A content event: its creator, name and deadline are read from the content. */
  private byContent(
    contentId: string,
    template: string,
    keyPart: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    return this.reach(template, async () => {
      const content = await this.prisma.contents.findUnique({
        where: { id: contentId },
        select: CONTENT_SELECT,
      });
      if (!content) return null;
      return {
        creator: content.contracts.creators,
        event: {
          eventKey: `${template}:${keyPart}`,
          template,
          data: { contentId, contentName: content.name, ...extra },
        },
      };
    });
  }

  /** Finds the recipient, then sends; a failed read is logged, never thrown (AC 9). */
  private async reach(template: string, find: () => Promise<Addressed | null>): Promise<void> {
    let found: Addressed | null;
    try {
      found = await find();
    } catch (error) {
      this.log.warn(`Email ${template} failed (${errorKind(error)})`);
      return;
    }
    if (!found?.creator) return;

    const { creator, event } = found;
    await this.notifier.notify({
      ...event,
      to: { email: creator.users.email, name: joinName(creator) },
    });
  }
}
