import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ContentEventRecord {
  id: string;
  content_id: string;
  occurred_at: Date;
}

export type ContentEventType =
  | 'Scheduled'
  | 'Draft Submitted'
  | 'Revision Requested'
  | 'Draft Approved'
  | 'Link Submitted'
  | 'Creator Comment';

export type ContentEventActorRole = 'admin' | 'creator';

interface ContentEventBase<
  TType extends ContentEventType,
  TData extends Record<string, unknown>,
> {
  content_id: string;
  event_type: TType;
  actor_name: string;
  actor_role: ContentEventActorRole;
  occurred_at: Date;
  event_data: TData;
}

export type ContentEventInput =
  | ContentEventBase<'Scheduled', Record<string, never>>
  | ContentEventBase<'Draft Submitted', { version: number; link: string }>
  | ContentEventBase<'Revision Requested', { revision_note: string }>
  | ContentEventBase<'Draft Approved', Record<string, never>>
  | ContentEventBase<'Link Submitted', { link: string }>
  | ContentEventBase<'Creator Comment', { comment: string }>;

export type ContentEventOrder = readonly [
  { occurred_at: 'desc' },
  { id: 'desc' },
];

export interface ContentEventQuery {
  where: { content_id: string };
  orderBy: ContentEventOrder;
}

/** The small Prisma surface needed to read one content item's event history. */
export interface ContentEventHistoryClient {
  content_events: {
    findMany(query: ContentEventQuery): Promise<ContentEventRecord[]>;
    create(args: { data: ContentEventInput }): Promise<void>;
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
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
  }

  record(input: ContentEventInput): Promise<void> {
    return this.prisma.content_events.create({ data: input });
  }
}
