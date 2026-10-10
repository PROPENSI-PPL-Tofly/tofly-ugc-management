import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ContentEventRecord {
  id: string;
  content_id: string;
  occurred_at: Date;
}

export type ContentEventOrder = readonly [
  { occurred_at: 'desc' },
  { id: 'desc' },
];

export interface ContentEventQuery {
  where: { content_id: string };
  orderBy?: ContentEventOrder;
}

/** The small Prisma surface needed to read one content item's event history. */
export interface ContentEventHistoryClient {
  content_events: {
    findMany(query: ContentEventQuery): Promise<ContentEventRecord[]>;
  };
}

@Injectable()
export class ContentEventHistoryService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentEventHistoryClient,
  ) {}

  getForContent(contentId: string): Promise<ContentEventRecord[]> {
    return this.prisma.content_events.findMany({
      where: { content_id: contentId },
    });
  }
}
