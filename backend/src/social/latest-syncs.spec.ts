import { latestSyncs, syncKey } from './latest-syncs.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SYNCED_AT = new Date('2026-11-02T19:00:00.000Z');

describe('latestSyncs', () => {
  it('keys each creator and platform by its latest sync', async () => {
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([
        { creator_id: CREATOR, platform: 'tiktok', last_sync: SYNCED_AT },
        { creator_id: OTHER, platform: 'instagram', last_sync: SYNCED_AT },
      ]),
    };

    const syncs = await latestSyncs(client, [CREATOR, OTHER]);

    expect(syncs.get(syncKey(CREATOR, 'tiktok'))).toBe(SYNCED_AT);
    expect(syncs.get(syncKey(OTHER, 'instagram'))).toBe(SYNCED_AT);
    expect(syncs.get(syncKey(CREATOR, 'instagram'))).toBeUndefined();
  });

  it('reads every creator in one query, with the ids bound as a parameter', async () => {
    const client = { $queryRaw: vi.fn().mockResolvedValue([]) };

    await latestSyncs(client, [CREATOR, OTHER]);

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    const query = client.$queryRaw.mock.calls[0][0];
    expect(query.values).toEqual([[CREATOR, OTHER]]);
    expect(query.sql).not.toContain(CREATOR);
  });

  it('asks nothing when there is no creator to read', async () => {
    const client = { $queryRaw: vi.fn() };

    const syncs = await latestSyncs(client, []);

    expect(syncs.size).toBe(0);
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });
});
