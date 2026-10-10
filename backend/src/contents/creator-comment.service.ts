import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatorComment } from './creator-comment.js';

export interface CreatorCommentTransaction {
  contents: {
    findFirst(args: {
      where: {
        id: string;
        is_proposal: false;
        contracts: { creator_id: string };
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
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
          is_proposal: false,
          contracts: { creator_id: creatorId },
        },
        select: { id: true },
      });

      if (!content) {
        throw new NotFoundException({
          code: 'CONTENT_NOT_FOUND',
          message: 'Konten tidak ditemukan',
        });
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
