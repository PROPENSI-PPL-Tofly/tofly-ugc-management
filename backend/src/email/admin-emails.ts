import { Inject, Injectable, Logger } from '@nestjs/common';
import { joinName, type NameParts } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminNotifier } from './admin-notifier.js';
import { EMAIL_LOG } from './email-log.token.js';
import { EmailNotifier, errorKind, type EmailEvent, type EmailRecipient } from './email-notifier.js';

// The Admins' side of PBI-11 (AC 5, 11.2): a creator's action is told to every Admin, one email
// each (AC 8), all sent at once by the helper. The recipients are read in one place, so when
// PBI-23's Admin status reaches this branch, adding "active only" there is the whole change.

const CREATOR_NAMES = { first_name: true, middle_name: true, last_name: true } as const;

/** The slice of Prisma the adapter reads, so tests hand in a stub of just that. */
export interface AdminEmailClient {
  users: {
    findMany(args: {
      where: { is_admin: true };
      select: { email: true };
      orderBy: { email: 'asc' };
    }): Promise<{ email: string }[]>;
  };
  contents: {
    findUnique(args: {
      where: { id: string };
      select: { name: true; contracts: { select: { creators: { select: typeof CREATOR_NAMES } } } };
    }): Promise<{ name: string; contracts: { creators: NameParts | null } } | null>;
  };
  contracts: {
    findUnique(args: {
      where: { id: string };
      select: { creators: { select: typeof CREATOR_NAMES } };
    }): Promise<{ creators: NameParts | null } | null>;
  };
}

function creatorName(creator: NameParts | null): string {
  return creator ? joinName(creator) : '';
}

@Injectable()
export class AdminEmails implements AdminNotifier {
  constructor(
    @Inject(PrismaService) private readonly prisma: AdminEmailClient,
    @Inject(EmailNotifier)
    private readonly notifier: {
      notifyAll(event: Omit<EmailEvent, 'to'> & { to: readonly EmailRecipient[] }): Promise<unknown>;
    },
    @Inject(EMAIL_LOG) private readonly log: Pick<Logger, 'warn'>,
  ) {}

  draftSubmitted({ contentId, submissionId }: { contentId: string; submissionId: string }) {
    return this.reach('draft_submitted', async () => {
      const content = await this.prisma.contents.findUnique({
        where: { id: contentId },
        select: { name: true, contracts: { select: { creators: { select: CREATOR_NAMES } } } },
      });
      if (!content) return null;
      return {
        eventKey: `draft_submitted:${submissionId}`,
        template: 'draft_submitted',
        data: {
          contentId,
          contentName: content.name,
          creatorName: creatorName(content.contracts.creators),
        },
      };
    });
  }

  invoiceAcknowledged({ contractId }: { contractId: string }) {
    return this.reach('invoice_acknowledged', async () => {
      const contract = await this.prisma.contracts.findUnique({
        where: { id: contractId },
        select: { creators: { select: CREATOR_NAMES } },
      });
      if (!contract) return null;
      return {
        eventKey: `invoice_acknowledged:${contractId}`,
        template: 'invoice_acknowledged',
        data: { contractId, creatorName: creatorName(contract.creators) },
      };
    });
  }

  // Every Admin. No Admin can be deactivated on this branch yet; once PBI-23's status is here,
  // this is where "active only" goes (PBI-11 AC 5). No Admin name exists yet either, so the
  // greeting uses the address until PBI-23 adds names.
  private async admins(): Promise<EmailRecipient[]> {
    const rows = await this.prisma.users.findMany({
      where: { is_admin: true },
      select: { email: true },
      orderBy: { email: 'asc' },
    });
    return rows.map(({ email }) => ({ email, name: email }));
  }

  /** Finds the event and its Admins, then sends; a failed read is logged, never thrown (AC 9). */
  private async reach(
    template: string,
    find: () => Promise<Omit<EmailEvent, 'to'> | null>,
  ): Promise<void> {
    let event: Omit<EmailEvent, 'to'> | null;
    let to: EmailRecipient[];
    try {
      event = await find();
      if (!event) return;
      to = await this.admins();
    } catch (error) {
      this.log.warn(`Email ${template} failed (${errorKind(error)})`);
      return;
    }
    if (to.length > 0) await this.notifier.notifyAll({ ...event, to });
  }
}
