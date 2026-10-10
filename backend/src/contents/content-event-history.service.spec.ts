import {
  ContentEventHistoryService,
  type ContentEventHistoryClient,
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
  return { id, content_id: contentId, occurred_at: new Date(occurredAt) };
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
    content_events: { findMany },
  } satisfies ContentEventHistoryClient;

  return { findMany, service: new ContentEventHistoryService(client) };
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
