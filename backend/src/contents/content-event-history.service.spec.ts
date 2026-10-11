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

function stubClient(events: ContentEventRecord[], contentExists = true) {
  const findMany = vi.fn(async (query: ContentEventQuery) => {
    const matching = events.filter(
      (candidate) => candidate.content_id === query.where.content_id,
    );

    return matching.sort((left, right) => {
      const byTime = right.occurred_at.getTime() - left.occurred_at.getTime();
      return byTime || right.id.localeCompare(left.id);
    });
  });

  const findContent = vi.fn(async ({ where }: { where: { id: string } }) =>
    contentExists ? { id: where.id } : null,
  );

  const client = {
    contents: {
      findUnique: findContent,
    },
    content_events: {
      findMany,
      create: vi.fn(async (_args: { data: ContentEventInput }) => undefined),
    },
  } satisfies ContentEventHistoryClient;

  return {
    findMany,
    findContent,
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

async function expectInvalidInput(input: unknown): Promise<void> {
  const { create, service } = stubClient([]);

  await expect(service.record(unvalidatedInput(input))).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
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
    expect(findMany).toHaveBeenCalledWith({
      where: { content_id: CONTENT_ID },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
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

  it('returns the structured 404 response without querying events when content is missing', async () => {
    const { findContent, findMany, service } = stubClient([], false);

    await expect(service.getForContent(CONTENT_ID)).rejects.toMatchObject({
      response: {
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      },
    });

    expect(findContent).toHaveBeenCalledWith({
      where: { id: CONTENT_ID },
      select: { id: true },
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('ContentEventHistoryService.record', () => {
  it.each(VALID_WRITES)('persists a valid $event_type event', async (input) => {
    const { create, service } = stubClient([]);

    await service.record(input);

    expect(create).toHaveBeenCalledWith({ data: input });
  });

  it.each([
    { label: 'null', input: null },
    { label: 'a string', input: 'not-an-event' },
    { label: 'an array', input: [] },
  ])('rejects a non-object event input: $label', async ({ input }) => {
    await expectInvalidInput(input);
  });

  it('rejects an event without a content ID', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[0],
      content_id: '',
    });
  });

  it('rejects an event without an actor name', async () => {
    await expectInvalidInput({
      content_id: CONTENT_ID,
      event_type: 'Scheduled',
      actor_role: 'admin',
      occurred_at: new Date('2026-10-01T10:00:00Z'),
      event_data: {},
    });
  });

  it('rejects a blank actor name', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[0],
      actor_name: '   ',
    });
  });

  it('rejects an unsupported actor role', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[0],
      actor_role: 'owner',
    });
  });

  it('rejects a timestamp that is not a Date', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[0],
      occurred_at: '2026-10-01T10:00:00Z',
    });
  });

  it('rejects an invalid Date timestamp', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[0],
      occurred_at: new Date('invalid'),
    });
  });

  it('rejects an unsupported event type', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[0],
      event_type: 'Unknown Event',
    });
  });

  it.each([
    { label: 'null', event_data: null },
    { label: 'a string', event_data: 'not-an-object' },
    { label: 'an array', event_data: [] },
  ])('rejects non-object event data: $label', async ({ event_data }) => {
    await expectInvalidInput({
      ...VALID_WRITES[0],
      event_data,
    });
  });

  it.each([
    { label: 'a missing version', event_data: { link: 'https://example.com' } },
    {
      label: 'a string version',
      event_data: { version: '2', link: 'https://example.com' },
    },
    {
      label: 'a fractional version',
      event_data: { version: 1.5, link: 'https://example.com' },
    },
    {
      label: 'a zero version',
      event_data: { version: 0, link: 'https://example.com' },
    },
  ])('rejects Draft Submitted with $label', async ({ event_data }) => {
    await expectInvalidInput({
      ...VALID_WRITES[1],
      event_data,
    });
  });

  it('rejects Draft Submitted without a nonblank link', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[1],
      event_data: { version: 1, link: '   ' },
    });
  });

  it('rejects Revision Requested without a nonblank note', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[2],
      event_data: { revision_note: '   ' },
    });
  });

  it('rejects Link Submitted without a nonblank link', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[4],
      event_data: { link: '' },
    });
  });

  it('rejects Creator Comment without a nonblank comment', async () => {
    await expectInvalidInput({
      ...VALID_WRITES[5],
      event_data: { comment: '   ' },
    });
  });

  it('does not swallow a persistence failure', async () => {
    const { create, service } = stubClient([]);
    const persistenceError = new Error('Database write failed');
    create.mockRejectedValueOnce(persistenceError);

    await expect(service.record(VALID_WRITES[0])).rejects.toBe(
      persistenceError,
    );
  });
});
