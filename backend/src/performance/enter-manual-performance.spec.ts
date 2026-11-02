import { HttpException } from '@nestjs/common';
import {
  EnterManualPerformance,
  type PerformanceTarget,
} from './enter-manual-performance.js';

const NOW = new Date('2026-11-04T03:15:00.000Z');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const SYNCED_AT = new Date('2026-11-03T19:00:00.000Z');

/** A delivered content's TikTok link on an unconnected account, read under the contract lock. */
function target(overrides: Partial<PerformanceTarget> = {}): PerformanceTarget {
  return {
    contentId: 'content-1',
    invoiceStatus: 'running',
    connection: undefined,
    link: {
      id: 'link-1',
      platform: 'tiktok',
      url: 'https://www.tiktok.com/@nabila/video/7412345678901234567',
      data_state: 'sync_failed',
      views: 9000,
      likes: null,
      comments: 0,
      shares: 3,
      last_synced_at: SYNCED_AT,
    },
    ...overrides,
  };
}

const ENTERED = { views: 12400, likes: 500, comments: 0, shares: null };

describe('EnterManualPerformance', () => {
  const plan = () =>
    new EnterManualPerformance('tiktok', ENTERED).plan(target(), ADMIN, NOW);

  it('writes the four numbers as typed, a 0 and an empty one included, as manual with the admin and the time', () => {
    expect(plan().data).toEqual({
      views: 12400,
      likes: 500,
      comments: 0,
      shares: null,
      data_state: 'manual',
      manual_by: ADMIN,
      manual_at: NOW,
    });
  });

  it('leaves the last sync time alone: the numbers did not come from a sync', () => {
    expect(plan().data).not.toHaveProperty('last_synced_at');
  });

  it('writes only on the link as it was read: its id, its state and its video', () => {
    expect(plan().guard).toEqual({
      id: 'link-1',
      data_state: 'sync_failed',
      url: 'https://www.tiktok.com/@nabila/video/7412345678901234567',
    });
  });

  it('records Performance Entered by the admin with the platform and the old and new numbers', () => {
    expect(plan().event).toEqual({
      content_id: 'content-1',
      event_type: 'Performance Entered',
      actor_name: 'Admin',
      actor_role: 'admin',
      actor_user_id: ADMIN,
      occurred_at: NOW,
      event_data: {
        platform: 'tiktok',
        previous: { views: 9000, likes: null, comments: 0, shares: 3 },
        entered: { views: 12400, likes: 500, comments: 0, shares: null },
      },
    });
  });

  describe('refusals, in the order they are checked', () => {
    /** The status and body a plan is refused with, or null when it was planned. */
    function refusal(
      read: PerformanceTarget,
      admin: string | null = ADMIN,
    ): { status: number; body: unknown } | null {
      try {
        new EnterManualPerformance('tiktok', ENTERED).plan(read, admin, NOW);
        return null;
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        return { status: error.getStatus(), body: error.getResponse() };
      }
    }

    const FINALIZED = {
      status: 409,
      body: {
        code: 'INVOICE_FINALIZED',
        message: 'Invoice sudah difinalisasi. Koreksi lewat penyesuaian.',
      },
    };

    it('refuses with 403 when no admin account is behind the request, before anything else', () => {
      expect(
        refusal(target({ invoiceStatus: 'paid', link: null }), null),
      ).toEqual({
        status: 403,
        body: {
          code: 'ADMIN_ACCOUNT_REQUIRED',
          message: 'Angka manual hanya bisa diisi oleh akun Admin',
        },
      });
    });

    it('refuses a frozen invoice before looking at the link: the numbers it froze stay', () => {
      expect(
        refusal(target({ invoiceStatus: 'finalized', link: null })),
      ).toEqual(FINALIZED);
    });

    it('refuses with 404 when the content has no link on that platform', () => {
      expect(refusal(target({ link: null }))).toEqual({
        status: 404,
        body: {
          code: 'LINK_NOT_FOUND',
          message: 'Belum ada link TikTok untuk konten ini',
        },
      });
    });

    it('refuses a synced link with 409 MANUAL_NOT_ALLOWED', () => {
      expect(
        refusal(target({ link: { ...target().link!, data_state: 'synced' } })),
      ).toMatchObject({ status: 409, body: { code: 'MANUAL_NOT_ALLOWED' } });
    });

    it("judges a waiting link by the creator's account: open while unconnected, refused once connected", () => {
      const waiting = { ...target().link!, data_state: 'waiting' as const };

      expect(refusal(target({ link: waiting }))).toBeNull();
      expect(
        refusal(
          target({
            link: waiting,
            connection: { is_connected: true, platform_user_id: null },
          }),
        ),
      ).toBeNull();
      expect(
        refusal(
          target({
            link: waiting,
            connection: { is_connected: true, platform_user_id: '7012' },
          }),
        ),
      ).toMatchObject({ status: 409, body: { code: 'MANUAL_NOT_ALLOWED' } });
    });
  });

  it("answers the link's performance as the card reads it, never the admin", () => {
    expect(plan().result).toEqual({
      views: 12400,
      likes: 500,
      comments: 0,
      shares: null,
      state: 'manual',
      lastSyncedAt: SYNCED_AT.toISOString(),
      manualAt: NOW.toISOString(),
    });
  });
});
