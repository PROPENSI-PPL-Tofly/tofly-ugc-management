import {
  MySocialAccountsService,
  type MySocialAccountRows,
} from './my-social-accounts.service.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const CONNECTED_AT = new Date('2026-10-29T03:00:00.000Z');

describe('MySocialAccountsService', () => {
  let rows: {
    social_accounts: {
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: MySocialAccountsService;

  beforeEach(() => {
    rows = {
      social_accounts: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new MySocialAccountsService(
      rows as unknown as MySocialAccountRows,
    );
  });

  describe('list', () => {
    it("answers one entry per platform the creator has, in the panel's shape", async () => {
      rows.social_accounts.findMany.mockResolvedValue([
        {
          platform: 'instagram',
          username: 'rangga.creates',
          is_connected: true,
          platform_user_id: '1784',
          connected_at: CONNECTED_AT,
        },
        {
          platform: 'tiktok',
          username: 'rangga.typed',
          is_connected: false,
          platform_user_id: null,
          connected_at: null,
        },
      ]);

      await expect(service.list(CREATOR)).resolves.toEqual({
        accounts: [
          {
            platform: 'instagram',
            connected: true,
            username: 'rangga.creates',
            connectedAt: '2026-10-29T03:00:00.000Z',
            lastSyncAt: null,
          },
          {
            platform: 'tiktok',
            connected: false,
            username: 'rangga.typed',
            connectedAt: null,
            lastSyncAt: null,
          },
        ],
      });
    });

    it('answers an empty list for a creator with no account', async () => {
      await expect(service.list(CREATOR)).resolves.toEqual({ accounts: [] });
    });

    // OWASP A01:2025: only this creator's rows, and the tokens are never read at all.
    it("reads only the creator's own rows, and no token", async () => {
      await service.list(CREATOR);

      const query = rows.social_accounts.findMany.mock.calls[0][0];
      expect(query.where).toEqual({ creator_id: CREATOR });
      expect(Object.keys(query.select).toSorted()).toEqual([
        'connected_at',
        'is_connected',
        'platform',
        'platform_user_id',
        'username',
      ]);
    });
  });

  describe('disconnect', () => {
    it('clears the tokens and the connection, and keeps the row and its username', async () => {
      await expect(service.disconnect(CREATOR, 'tiktok')).resolves.toBe(true);

      expect(rows.social_accounts.updateMany).toHaveBeenCalledWith({
        where: {
          creator_id: CREATOR,
          platform: 'tiktok',
          platform_user_id: { not: null },
        },
        data: {
          access_token: null,
          token_expires_at: null,
          refresh_token: null,
          refresh_token_expires_at: null,
          is_connected: false,
          platform_user_id: null,
          connected_at: null,
        },
      });
    });

    it('reports when the creator had nothing connected on the platform', async () => {
      rows.social_accounts.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.disconnect(CREATOR, 'tiktok')).resolves.toBe(false);
    });
  });
});
