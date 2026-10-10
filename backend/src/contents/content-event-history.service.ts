import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ContentEventRecord {
  id: string;
  content_id: string;
  event_type: ContentEventType;
  actor_name: string;
  actor_role: ContentEventActorRole;
  occurred_at: Date;
  event_data: Prisma.JsonValue;
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
  contents: {
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  content_events: {
    findMany(query: ContentEventQuery): Promise<ContentEventRecord[]>;
    create(args: { data: ContentEventInput }): Promise<unknown>;
  };
}

const CONTENT_EVENT_TYPES: readonly ContentEventType[] = [
  'Scheduled',
  'Draft Submitted',
  'Revision Requested',
  'Draft Approved',
  'Link Submitted',
  'Creator Comment',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonblankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function invalidContentEvent(
  errors: Record<string, string>,
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data event konten tidak valid',
    errors,
  });
}

function checkContentEventInput(input: unknown): ContentEventInput {
  if (!isObject(input)) {
    throw invalidContentEvent({ event: 'Harus berupa objek' });
  }

  const errors: Record<string, string> = {};
  if (!isNonblankString(input.content_id)) {
    errors.content_id = 'Wajib diisi';
  }
  if (!isNonblankString(input.actor_name)) {
    errors.actor_name = 'Wajib diisi';
  }
  if (input.actor_role !== 'admin' && input.actor_role !== 'creator') {
    errors.actor_role = 'Harus berupa admin atau creator';
  }
  if (
    !(input.occurred_at instanceof Date) ||
    !Number.isFinite(input.occurred_at.getTime())
  ) {
    errors.occurred_at = 'Harus berupa timestamp yang valid';
  }

  const validEventType = CONTENT_EVENT_TYPES.includes(
    input.event_type as ContentEventType,
  );
  if (!validEventType) {
    errors.event_type = 'Jenis event tidak didukung';
  }

  const eventData = input.event_data;
  if (!isObject(eventData)) {
    errors.event_data = 'Harus berupa objek';
  } else if (validEventType) {
    switch (input.event_type as ContentEventType) {
      case 'Draft Submitted':
        if (
          typeof eventData.version !== 'number' ||
          !Number.isInteger(eventData.version) ||
          eventData.version <= 0
        ) {
          errors.version = 'Harus berupa bilangan bulat positif';
        }
        if (!isNonblankString(eventData.link)) {
          errors.link = 'Wajib diisi';
        }
        break;
      case 'Revision Requested':
        if (!isNonblankString(eventData.revision_note)) {
          errors.revision_note = 'Wajib diisi';
        }
        break;
      case 'Link Submitted':
        if (!isNonblankString(eventData.link)) {
          errors.link = 'Wajib diisi';
        }
        break;
      case 'Creator Comment':
        if (!isNonblankString(eventData.comment)) {
          errors.comment = 'Wajib diisi';
        }
        break;
      case 'Scheduled':
      case 'Draft Approved':
        break;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw invalidContentEvent(errors);
  }

  return input as ContentEventInput;
}

@Injectable()
export class ContentEventHistoryService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentEventHistoryClient,
  ) {}

  async getForContent(contentId: string): Promise<ContentEventRecord[]> {
    const content = await this.prisma.contents.findUnique({
      where: { id: contentId },
      select: { id: true },
    });
    if (!content) {
      throw new NotFoundException({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      });
    }

    return this.prisma.content_events.findMany({
      where: { content_id: contentId },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
  }

  async record(input: ContentEventInput): Promise<void> {
    const data = checkContentEventInput(input);
    await this.prisma.content_events.create({ data });
  }
}
