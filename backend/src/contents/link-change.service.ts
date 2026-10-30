import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type content_status } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isLinkTaken } from './content-links.js';
import { COMMITTED_STATUSES } from './content-lifecycle.js';
import {
  CONTENT_CHANGED,
  NO_PERFORMANCE_COLUMNS,
  notEligible,
  ReplaceLink,
  SubmitLinks,
  type ContentLinksResult,
  type LinkChange,
  type LinkActor,
  type LinkedContent,
  type LinkEvent,
  type LinkPlan,
  type PerformanceColumns,
  type StoredLink,
} from './link-change.js';
import type { PlatformLink } from './link-request.js';

/** What the controllers depend on, so the persistence can be stubbed. */
export interface LinkChanger {
  submit(
    contentId: string,
    actor: LinkActor,
    links: readonly PlatformLink[],
  ): Promise<ContentLinksResult>;
  replace(
    contentId: string,
    actor: LinkActor,
    link: PlatformLink,
  ): Promise<ContentLinksResult>;
}

/**
 * Where PBI-27 binds the content_links columns a replaced link's numbers live in. Unbound, a
 * replace clears nothing beyond the link itself.
 */
export const LINK_PERFORMANCE_COLUMNS = Symbol('LINK_PERFORMANCE_COLUMNS');

/** Everything a link change decides on, read in one query (LinkedContent). */
export const LINKED_CONTENT_SELECT = {
  id: true,
  status: true,
  deadline: true,
  video_submitted_at: true,
  content_links: {
    select: { id: true, platform: true, url: true, submitted_at: true },
  },
  contracts: {
    select: {
      invoice: { select: { status: true } },
      creators: {
        select: {
          user_id: true,
          first_name: true,
          middle_name: true,
          last_name: true,
          social_accounts: { select: { platform: true } },
        },
      },
    },
  },
} as const;

/** The slice of Prisma a link change uses, so unit tests stub exactly that. */
export interface LinkChangeTransaction {
  contents: {
    findFirst(args: {
      where: {
        id: string;
        status: { in: content_status[] };
        contracts?: { creator_id: string };
      };
      select: typeof LINKED_CONTENT_SELECT;
    }): Promise<LinkedContent | null>;
    updateMany(args: {
      where: { id: string; status: content_status };
      data: NonNullable<LinkPlan['statusChange']>['data'];
    }): Promise<{ count: number }>;
  };
  content_links: {
    createMany(args: { data: StoredLink[] }): Promise<{ count: number }>;
    updateMany(args: {
      where: { id: string; url: string };
      data: NonNullable<LinkPlan['replace']>['data'];
    }): Promise<{ count: number }>;
  };
  content_events: {
    createMany(args: { data: LinkEvent[] }): Promise<{ count: number }>;
  };
}

export interface LinkChangeClient {
  $transaction<T>(
    work: (transaction: LinkChangeTransaction) => Promise<T>,
  ): Promise<T>;
}

/** The same platform linked by a request that committed between this one's read and write. */
function isPlatformTaken(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function storeRefusal(error: unknown): unknown {
  if (isLinkTaken(error)) {
    return new ConflictException({
      code: 'VIDEO_LINK_TAKEN',
      message: 'Link ini sudah dipakai di konten lain',
    });
  }
  if (isPlatformTaken(error)) {
    return new ConflictException({
      code: 'LINK_EXISTS',
      message:
        'Link untuk platform ini baru saja dikirim. Muat ulang lalu coba lagi',
    });
  }
  return error;
}

/**
 * Runs a link change (link-change.ts) against the database: one read of the content in reach
 * of the caller, then the plan's writes in the same transaction, one statement per kind however
 * many links there are. A refused plan, a lost race or a taken video rolls everything back.
 */
@Injectable()
export class LinkChangeService implements LinkChanger {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: LinkChangeClient,
    @Optional()
    @Inject(LINK_PERFORMANCE_COLUMNS)
    private readonly performanceColumns: PerformanceColumns = NO_PERFORMANCE_COLUMNS,
  ) {}

  submit(
    contentId: string,
    actor: LinkActor,
    links: readonly PlatformLink[],
  ): Promise<ContentLinksResult> {
    return this.run(contentId, actor, new SubmitLinks(links));
  }

  replace(
    contentId: string,
    actor: LinkActor,
    link: PlatformLink,
  ): Promise<ContentLinksResult> {
    return this.run(
      contentId,
      actor,
      new ReplaceLink(link, this.performanceColumns),
    );
  }

  private run(
    contentId: string,
    actor: LinkActor,
    change: LinkChange,
  ): Promise<ContentLinksResult> {
    const now = new Date();
    const clock = { now, today: jakartaDay(now) };

    return this.prisma.$transaction(async (transaction) => {
      // A proposal still pending and another creator's content read as missing (OWASP A01).
      const content = await transaction.contents.findFirst({
        where: {
          id: contentId,
          status: { in: [...COMMITTED_STATUSES] },
          ...actor.scope,
        },
        select: LINKED_CONTENT_SELECT,
      });
      if (!content) {
        throw new NotFoundException({
          code: 'CONTENT_NOT_FOUND',
          message: 'Konten tidak ditemukan',
        });
      }

      const plan = change.plan(content, actor, clock);
      await this.write(transaction, contentId, plan);
      await transaction.content_events.createMany({ data: plan.events });
      return plan.result;
    });
  }

  private async write(
    transaction: LinkChangeTransaction,
    contentId: string,
    plan: LinkPlan,
  ): Promise<void> {
    if (plan.statusChange) {
      const { count } = await transaction.contents.updateMany({
        where: { id: contentId, status: plan.statusChange.from },
        data: plan.statusChange.data,
      });
      if (count === 0) {
        throw notEligible(CONTENT_CHANGED);
      }
    }

    try {
      if (plan.creates.length > 0) {
        await transaction.content_links.createMany({ data: plan.creates });
      }
      if (plan.replace) {
        const { count } = await transaction.content_links.updateMany({
          where: { id: plan.replace.id, url: plan.replace.fromUrl },
          data: plan.replace.data,
        });
        if (count === 0) {
          throw new ConflictException({
            code: 'LINK_CHANGED',
            message: 'Link ini baru saja diganti. Muat ulang lalu coba lagi',
          });
        }
      }
    } catch (error) {
      throw storeRefusal(error);
    }
  }
}
