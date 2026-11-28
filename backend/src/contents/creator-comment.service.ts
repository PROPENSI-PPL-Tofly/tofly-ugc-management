import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { content_status } from '@prisma/client';
import { StartedPeriodSpecification } from '../creators/started-period.specification.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COMMITTED_STATUSES } from './content-lifecycle.js';
import { periodNotStarted } from './period-not-started.js';
import type { CreatorComment } from './creator-comment.js';

export interface CreatorCommentTransaction {
  contents: {
    findFirst(args: {
      where: {
        id: string;
        status: { in: content_status[] };
        contracts: { creator_id: string };
      };
      select: { id: true; contracts: { select: { start_date: true } } };
    }): Promise<{ id: string; contracts: { start_date: Date } } | null>;
  };
  creators: {
    findUnique(args: {
      where: { id: string };
      select: { first_name: true; middle_name: true; last_name: true };
    }): Promise<{
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    } | null>;
  };
  content_events: {
    create(args: {
      data: {
        content_id: string;
        event_type: 'Creator Comment';
        actor_name: string;
        actor_role: 'creator';
        occurred_at: Date;
        event_data: { comment: string };
      };
    }): Promise<unknown>;
  };
}

export interface CreatorCommentClient {
  $transaction<T>(
    work: (transaction: CreatorCommentTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface CreatorCommentWriter {
  addComment(
    contentId: string,
    creatorId: string,
    input: CreatorComment,
  ): Promise<void>;
}

@Injectable()
export class CreatorCommentService implements CreatorCommentWriter {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: CreatorCommentClient,
  ) {}

  async addComment(
    contentId: string,
    creatorId: string,
    input: CreatorComment,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const content = await transaction.contents.findFirst({
        where: {
          id: contentId,
          status: { in: [...COMMITTED_STATUSES] },
          contracts: { creator_id: creatorId },
        },
        select: { id: true, contracts: { select: { start_date: true } } },
      });

      if (!content) {
        throw new NotFoundException({
          code: 'CONTENT_NOT_FOUND',
          message: 'Konten tidak ditemukan',
        });
      }
      // PBI-30 (AC 8.2): the creator's own content, but its period has not started, so it takes
      // no comment yet, as it takes no draft or link (OWASP A01).
      if (
        !new StartedPeriodSpecification(new Date()).isSatisfiedBy(
          content.contracts,
        )
      ) {
        throw periodNotStarted();
      }

      const creator = await transaction.creators.findUnique({
        where: { id: creatorId },
        select: { first_name: true, middle_name: true, last_name: true },
      });
      if (!creator) {
        throw new NotFoundException({
          code: 'CREATOR_NOT_FOUND',
          message: 'Kreator tidak ditemukan',
        });
      }

      await transaction.content_events.create({
        data: {
          content_id: content.id,
          event_type: 'Creator Comment',
          actor_name: [
            creator.first_name,
            creator.middle_name,
            creator.last_name,
          ]
            .filter(Boolean)
            .join(' '),
          actor_role: 'creator',
          occurred_at: new Date(),
          event_data: { comment: input.comment },
        },
      });
    });
  }
}
