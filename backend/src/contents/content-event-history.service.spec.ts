import {
  ContentEventHistoryService,
  type ContentEventHistoryClient,
  type ContentEventInput,
  type ContentEventQuery,
  type ContentEventRecord,
} from './content-event-history.service.js';

const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';
const OTHER_CONTENT_ID = 'b08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';
const TIE_ID_1 = '00000000-0000-4000-8000-000000000001';
const TIE_ID_2 = '00000000-0000-4000-8000-000000000002';

function event(
  id: string,
  contentId: string,
  occurredAt: string,
): ContentEventRecord {
  return {
    id,
    content_id: contentId,
    event_type: 'Scheduled',
    actor_name: 'Test Actor',
    actor_role: 'admin',
    occurred_at: new Date(occurredAt),
    event_data: {},
  };
}

function stubClient(events: ContentEventRecord[]) {
  const findMany = vi.fn(async (query: ContentEventQuery) => {
    const matching = events.filter(
      (candidate) => candidate.content_id === query.where.content_id,
    );

    if (!query.orderBy) return matching;

    return matching.sort((left, right) => {
      const byTime = right.occurred_at.getTime() - left.occurred_at.getTime();
      return byTime || right.id.localeCompare(left.id);
    });
  });
  const client = {
    contents: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
      })),
    },
    content_events: {
      findMany,
      create: vi.fn(async (_args: { data: ContentEventInput }) => undefined),
    },
  } satisfies ContentEventHistoryClient;

  return {
    findMany,
    create: client.content_events.create,
    service: new ContentEventHistoryService(client),
  };
}

const VALID_WRITES = [
  {
    content_id: CONTENT_ID,
    event_type: 'Scheduled',
    actor_name: 'Ayu Admin',
    actor_role: 'admin',
    occurred_at: new Date('2026-10-01T10:00:00Z'),
    event_data: {},
  },
  {
    content_id: CONTENT_ID,
    event_type: 'Draft Submitted',
    actor_name: 'Dina Creator',
    actor_role: 'creator',
    occurred_at: new Date('2026-10-02T10:00:00Z'),
    event_data: { version: 2, link: 'https://drive.example.com/draft-2' },
  },
  {
    content_id: CONTENT_ID,
    event_type: 'Revision Requested',
    actor_name: 'Ayu Admin',
    actor_role: 'admin',
    occurred_at: new Date('2026-10-03T10:00:00Z'),
    event_data: { revision_note: 'Please revise the opening.' },
  },
  {
    content_id: CONTENT_ID,
    event_type: 'Draft Approved',
    actor_name: 'Ayu Admin',
    actor_role: 'admin',
    occurred_at: new Date('2026-10-04T10:00:00Z'),
    event_data: {},
  },
  {
    content_id: CONTENT_ID,
    event_type: 'Link Submitted',
    actor_name: 'Dina Creator',
    actor_role: 'creator',
    occurred_at: new Date('2026-10-05T10:00:00Z'),
    event_data: { link: 'https://instagram.com/p/example' },
  },
  {
    content_id: CONTENT_ID,
    event_type: 'Creator Comment',
    actor_name: 'Dina Creator',
    actor_role: 'creator',
    occurred_at: new Date('2026-10-06T10:00:00Z'),
    event_data: { comment: 'I have added the requested detail.' },
  },
] satisfies ContentEventInput[];

function unvalidatedInput(input: unknown): ContentEventInput {
  return input as ContentEventInput;
}

describe('ContentEventHistoryService.getForContent', () => {
  it('returns events for the requested content item only', async () => {
    const requested = event('requested', CONTENT_ID, '2026-10-01T10:00:00Z');
    const { findMany, service } = stubClient([
      requested,
      event('other', OTHER_CONTENT_ID, '2026-10-02T10:00:00Z'),
    ]);

    await expect(service.getForContent(CONTENT_ID)).resolves.toEqual([
      requested,
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { content_id: CONTENT_ID } }),
    );
  });

  it('returns the newest event first', async () => {
    const newest = event('newest', CONTENT_ID, '2026-10-02T10:00:00Z');
    const oldest = event('oldest', CONTENT_ID, '2026-10-01T10:00:00Z');
    const { service } = stubClient([oldest, newest]);

    await expect(service.getForContent(CONTENT_ID)).resolves.toEqual([
      newest,
      oldest,
    ]);
  });

  it('orders events with identical timestamps by descending id', async () => {
    const laterId = event(TIE_ID_2, CONTENT_ID, '2026-10-02T10:00:00Z');
    const earlierId = event(TIE_ID_1, CONTENT_ID, '2026-10-02T10:00:00Z');
    const { service } = stubClient([earlierId, laterId]);

    await expect(service.getForContent(CONTENT_ID)).resolves.toEqual([
      laterId,
      earlierId,
    ]);
  });

  it('returns an empty list when the content has no events', async () => {
    const { service } = stubClient([]);

    await expect(service.getForContent(CONTENT_ID)).resolves.toEqual([]);
  });
});

describe('ContentEventHistoryService.record', () => {
  it.each(VALID_WRITES)('persists valid %s event data', async (input) => {
    const { create, service } = stubClient([]);

    await service.record(input);

    expect(create).toHaveBeenCalledWith({ data: input });
  });

  it('rejects an event without an actor name before persistence', async () => {
    const { create, service } = stubClient([]);
    const invalid = unvalidatedInput({
      content_id: CONTENT_ID,
      event_type: 'Scheduled',
      actor_role: 'admin',
      occurred_at: new Date('2026-10-01T10:00:00Z'),
      event_data: {},
    });

    await expect(service.record(invalid)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a Draft Submitted event without its version before persistence', async () => {
    const { create, service } = stubClient([]);
    const invalid = unvalidatedInput({
      ...VALID_WRITES[1],
      event_data: { link: 'https://drive.example.com/draft-2' },
    });

    await expect(service.record(invalid)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a Revision Requested event without its note before persistence', async () => {
    const { create, service } = stubClient([]);
    const invalid = unvalidatedInput({
      ...VALID_WRITES[2],
      event_data: {},
    });

    await expect(service.record(invalid)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
