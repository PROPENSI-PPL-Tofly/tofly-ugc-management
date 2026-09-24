import { Injectable, NotFoundException } from '@nestjs/common';
import type { content_type } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkCreateContent } from './create-content.js';

export interface CreatedContent {
  id: string;
  name: string;
  type: content_type;
  brief: string;
  deadline: string;
  status: string;
}

function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function creatorName(creator: {
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
}): string {
  return [creator.first_name, creator.middle_name, creator.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
}

@Injectable()
export class ContentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: unknown, now = new Date()): Promise<CreatedContent> {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const creatorId =
      typeof (input as { creatorId?: unknown } | null)?.creatorId === 'string'
        ? (input as { creatorId: string }).creatorId
        : '';

    const contracts = await this.prisma.contracts.findMany({
      where: {
        creator_id: creatorId,
        end_date: {
          gte: today,
        },
      },
      orderBy: {
        start_date: 'desc',
      },
      include: {
        creators: {
          select: {
            first_name: true,
            middle_name: true,
            last_name: true,
          },
        },
        contents: {
          select: {
            id: true,
            name: true,
            type: true,
            is_proposal: true,
          },
        },
      },
    });

    const contract =
      contracts.find(
        (item) => item.start_date <= today && item.end_date >= today,
      ) ?? contracts.at(0);

    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'Kontrak creator tidak ditemukan',
      });
    }

    const actualContents = contract.contents.filter(
      (content) => !content.is_proposal,
    );

    const evergreenContents = actualContents.filter(
      (content) => content.type === 'evergreen',
    );

    const validated = checkCreateContent(input, {
      today,
      contractStart: contract.start_date,
      contractEnd: contract.end_date,
      quota: contract.content_quota,
      totalContentCount: actualContents.length,
      evergreenCount: evergreenContents.length,
    });

    const finalName =
      validated.type === 'evergreen'
        ? this.nextEvergreenName(
            evergreenContents.map((content) => content.name),
            creatorName(contract.creators),
            validated.deadline,
          )
        : validated.name;

    const content = await this.prisma.contents.create({
      data: {
        contract_id: contract.id,
        name: finalName,
        type: validated.type,
        brief: validated.brief,
        deadline: validated.deadline,
        is_proposal: false,
      },
    });

    this.notifyCreatorMock({
      creatorId: contract.creator_id,
      contentName: content.name,
      deadline: calendarDay(content.deadline),
    });

    return {
      id: content.id,
      name: content.name,
      type: content.type,
      brief: content.brief,
      deadline: calendarDay(content.deadline),
      status: content.status,
    };
  }

  private notifyCreatorMock(input: {
    creatorId: string;
    contentName: string;
    deadline: string;
  }): void {
    console.info('[MOCK EMAIL] Creator content notification', input);
  }

  private nextEvergreenName(
    existingNames: string[],
    creator: string,
    deadline: Date,
  ): string {
    let nextNumber = 1;

    for (const name of existingNames) {
      const match = /^Evg_(\d+)_/.exec(name);

      if (match) {
        nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
      }
    }

    const safeCreator = creator.trim().replace(/\s+/g, '_') || 'Creator';

    return `Evg_${nextNumber}_${safeCreator}_${calendarDay(deadline)}`;
  }
}
