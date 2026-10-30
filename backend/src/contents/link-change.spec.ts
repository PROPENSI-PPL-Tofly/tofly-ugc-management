import {
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { content_status, social_platform } from '@prisma/client';
import {
  AdminLinkActor,
  CreatorLinkActor,
  NO_PERFORMANCE_COLUMNS,
  ReplaceLink,
  SubmitLinks,
  type LinkClock,
  type LinkActor,
  type LinkedContent,
} from './link-change.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const CREATOR_USER = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ADMIN_USER = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

const REEL = 'https://www.instagram.com/reel/C9xYz/';
const OTHER_REEL = 'https://www.instagram.com/p/D1aBc/';
const VIDEO = 'https://www.tiktok.com/@tofly/video/7312345678901234567';

// 10 Oct 2026, 09.30 WIB: the day the store keeps is the Jakarta day, the event keeps the moment.
const CLOCK: LinkClock = {
  now: new Date('2026-10-10T02:30:00.000Z'),
  today: '2026-10-10',
};
const TODAY = new Date('2026-10-10T00:00:00.000Z');

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function content(
  overrides: {
    status?: content_status;
    deadline?: string;
    submittedAt?: string | null;
    links?: {
      platform: social_platform | null;
      url: string;
      submittedAt: string;
    }[];
    invoice?: 'running' | 'finalized' | 'paid' | null;
    accounts?: social_platform[];
  } = {},
): LinkedContent {
  return {
    id: CONTENT_ID,
    status: overrides.status ?? 'draft_approved',
    deadline: day(overrides.deadline ?? '2026-10-20'),
    video_submitted_at:
      overrides.submittedAt === undefined || overrides.submittedAt === null
        ? null
        : day(overrides.submittedAt),
    content_links: (overrides.links ?? []).map((link, index) => ({
      id: `link-${index}`,
      platform: link.platform,
      url: link.url,
      submitted_at: day(link.submittedAt),
    })),
    contracts: {
      invoice:
        overrides.invoice === undefined || overrides.invoice === null
          ? null
          : { status: overrides.invoice },
      creators: {
        user_id: CREATOR_USER,
        first_name: 'Rani',
        middle_name: null,
        last_name: 'Putri',
        social_accounts: (overrides.accounts ?? ['instagram', 'tiktok']).map(
          (platform) => ({ platform }),
        ),
      },
    },
  };
}

/** A content that already has its Instagram link from 5 Oct, so its submitted day is 5 Oct. */
function linked(overrides: Parameters<typeof content>[0] = {}): LinkedContent {
  return content({
    status: 'link_submitted',
    submittedAt: '2026-10-05',
    links: [{ platform: 'instagram', url: REEL, submittedAt: '2026-10-05' }],
    ...overrides,
  });
}

const creator: LinkActor = new CreatorLinkActor(CREATOR_ID);
const admin: LinkActor = new AdminLinkActor(ADMIN_USER);

function refusal(run: () => unknown): { status: number; body: unknown } {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    return {
      status: (error as HttpException).getStatus(),
      body: (error as HttpException).getResponse(),
    };
  }
  throw new Error('expected a refusal');
}

describe('link actors', () => {
  it("scopes a creator to their own contents, so another creator's reads as missing", () => {
    expect(creator.scope).toEqual({ contracts: { creator_id: CREATOR_ID } });
    expect(creator.submittedBy(content())).toBe(CREATOR_USER);
    expect(creator.eventActor(content())).toEqual({
      actor_name: 'Rani Putri',
      actor_role: 'creator',
      actor_user_id: null,
    });
  });

  it('lets an admin reach every content and names them by role only', () => {
    expect(admin.scope).toEqual({});
    expect(admin.submittedBy(content())).toBe(ADMIN_USER);
    expect(admin.eventActor(content())).toEqual({
      actor_name: 'Admin',
      actor_role: 'admin',
      actor_user_id: ADMIN_USER,
    });
  });

  it('records the creator as the hand-in of an admin with no account, the local sign-in stand-in', () => {
    const local: LinkActor = new AdminLinkActor(null);

    expect(local.submittedBy(content())).toBe(CREATOR_USER);
    expect(local.eventActor(content()).actor_user_id).toBeNull();
  });
});

describe('SubmitLinks', () => {
  describe('the first links of a content', () => {
    it('moves the content to Link Dikirim on today, stores each link and writes one event per link', () => {
      const plan = new SubmitLinks([
        { platform: 'instagram', url: REEL },
        { platform: 'tiktok', url: VIDEO },
      ]).plan(content(), creator, CLOCK);

      expect(plan.statusChange).toEqual({
        from: 'draft_approved',
        data: {
          status: 'link_submitted',
          video_submitted_at: TODAY,
          approval_bypassed: false,
        },
      });
      expect(plan.creates).toEqual([
        {
          content_id: CONTENT_ID,
          platform: 'instagram',
          url: REEL,
          normalized_url: 'instagram:C9xYz',
          submitted_at: TODAY,
          submitted_by: CREATOR_USER,
        },
        {
          content_id: CONTENT_ID,
          platform: 'tiktok',
          url: VIDEO,
          normalized_url: 'tiktok:7312345678901234567',
          submitted_at: TODAY,
          submitted_by: CREATOR_USER,
        },
      ]);
      expect(plan.replace).toBeUndefined();
      expect(plan.events).toEqual([
        {
          content_id: CONTENT_ID,
          event_type: 'Link Submitted',
          actor_name: 'Rani Putri',
          actor_role: 'creator',
          actor_user_id: null,
          occurred_at: CLOCK.now,
          event_data: { link: REEL, platform: 'instagram' },
        },
        {
          content_id: CONTENT_ID,
          event_type: 'Link Submitted',
          actor_name: 'Rani Putri',
          actor_role: 'creator',
          actor_user_id: null,
          occurred_at: CLOCK.now,
          event_data: { link: VIDEO, platform: 'tiktok' },
        },
      ]);
      expect(plan.result).toEqual({
        contentId: CONTENT_ID,
        status: 'link_submitted',
        submittedAt: '2026-10-10',
        links: [
          { platform: 'instagram', url: REEL, submittedAt: '2026-10-10' },
          { platform: 'tiktok', url: VIDEO, submittedAt: '2026-10-10' },
        ],
      });
    });

    it('marks the approval as bypassed for a draft still in review at H-1', () => {
      const plan = new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
        content({ status: 'draft_review', deadline: '2026-10-11' }),
        creator,
        CLOCK,
      );

      expect(plan.statusChange?.data.approval_bypassed).toBe(true);
    });

    // AC 6: the window is unchanged, and a late link is still a link.
    it('takes a link after the deadline has passed', () => {
      const plan = new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
        content({ deadline: '2026-10-01' }),
        creator,
        CLOCK,
      );

      expect(plan.statusChange?.data.video_submitted_at).toEqual(TODAY);
    });

    it.each([
      [
        'scheduled',
        '2026-10-11',
        'Kirim draft dulu sebelum mengirim link video',
      ],
      [
        'draft_revision',
        '2026-10-11',
        'Kirim ulang draft dulu sebelum mengirim link video',
      ],
      [
        'draft_review',
        '2026-10-12',
        'Link video bisa dikirim setelah draft disetujui, atau mulai H-1 deadline',
      ],
    ] as const)(
      'refuses a %s content due %s and says what opens the link',
      (status, deadline, message) => {
        expect(
          refusal(() =>
            new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
              content({ status, deadline }),
              creator,
              CLOCK,
            ),
          ),
        ).toEqual({
          status: 409,
          body: { code: 'VIDEO_NOT_ELIGIBLE', message },
        });
      },
    );
  });

  describe('a link for another platform later (AC 8)', () => {
    it('stores the link and its event and leaves the status and submitted day alone', () => {
      const plan = new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
        linked(),
        creator,
        CLOCK,
      );

      expect(plan.statusChange).toBeUndefined();
      expect(plan.creates).toHaveLength(1);
      expect(plan.events.map((event) => event.event_data)).toEqual([
        { link: VIDEO, platform: 'tiktok' },
      ]);
      expect(plan.result).toEqual({
        contentId: CONTENT_ID,
        status: 'link_submitted',
        submittedAt: '2026-10-05',
        links: [
          { platform: 'instagram', url: REEL, submittedAt: '2026-10-05' },
          { platform: 'tiktok', url: VIDEO, submittedAt: '2026-10-10' },
        ],
      });
    });

    it('is taken long after the deadline, until the invoice is finalized', () => {
      const plan = new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
        linked({ deadline: '2026-09-01', invoice: 'running' }),
        creator,
        CLOCK,
      );

      expect(plan.creates).toHaveLength(1);
    });

    it('refuses a platform that already has a link and points at replacing it', () => {
      expect(
        refusal(() =>
          new SubmitLinks([
            { platform: 'instagram', url: OTHER_REEL },
            { platform: 'tiktok', url: VIDEO },
          ]).plan(linked(), creator, CLOCK),
        ),
      ).toEqual({
        status: 409,
        body: {
          code: 'LINK_EXISTS',
          message:
            'Link Instagram sudah dikirim. Gunakan Ganti Link untuk menggantinya',
        },
      });
    });

    it('keeps an old link with no platform as the first one and its day as the submitted day', () => {
      const plan = new SubmitLinks([{ platform: 'instagram', url: REEL }]).plan(
        linked({
          links: [
            {
              platform: null,
              url: 'https://example.com/v/1',
              submittedAt: '2026-10-05',
            },
          ],
        }),
        creator,
        CLOCK,
      );

      expect(plan.result.submittedAt).toBe('2026-10-05');
      expect(plan.result.links.map((link) => link.platform)).toEqual([
        null,
        'instagram',
      ]);
    });
  });

  it('refuses a platform the creator has no account for, under that field', () => {
    expect(
      refusal(() =>
        new SubmitLinks([
          { platform: 'instagram', url: REEL },
          { platform: 'tiktok', url: VIDEO },
        ]).plan(content({ accounts: ['instagram'] }), creator, CLOCK),
      ),
    ).toEqual({
      status: 422,
      body: {
        message: 'Data link video tidak valid',
        errors: { tiktok: 'Creator belum punya akun TikTok' },
      },
    });
  });

  it.each(['finalized', 'paid'] as const)(
    'refuses every link once the invoice is %s, before any other check',
    (invoice) => {
      expect(
        refusal(() =>
          new SubmitLinks([{ platform: 'instagram', url: OTHER_REEL }]).plan(
            linked({ invoice, accounts: [] }),
            creator,
            CLOCK,
          ),
        ).body,
      ).toMatchObject({ code: 'INVOICE_FINALIZED' });
    },
  );

  it('reads a proposal still pending as changed under the caller, since nothing opens its link', () => {
    expect(
      refusal(() =>
        new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
          content({ status: 'pending' }),
          creator,
          CLOCK,
        ),
      ).body,
    ).toEqual({
      code: 'VIDEO_NOT_ELIGIBLE',
      message: 'Status konten ini baru saja berubah. Muat ulang lalu coba lagi',
    });
  });

  it('reads a content in Link Dikirim with no link left as changed under the caller', () => {
    expect(
      refusal(() =>
        new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
          content({ status: 'link_submitted' }),
          creator,
          CLOCK,
        ),
      ),
    ).toEqual({
      status: 409,
      body: {
        code: 'VIDEO_NOT_ELIGIBLE',
        message:
          'Status konten ini baru saja berubah. Muat ulang lalu coba lagi',
      },
    });
  });
});

describe('ReplaceLink', () => {
  it('swaps the url in place, dated today, and records the old and new link (AC 9)', () => {
    const plan = new ReplaceLink(
      { platform: 'instagram', url: OTHER_REEL },
      NO_PERFORMANCE_COLUMNS,
    ).plan(linked(), admin, CLOCK);

    expect(plan.statusChange).toBeUndefined();
    expect(plan.creates).toEqual([]);
    expect(plan.replace).toEqual({
      id: 'link-0',
      fromUrl: REEL,
      data: {
        url: OTHER_REEL,
        normalized_url: 'instagram:D1aBc',
        submitted_at: TODAY,
        submitted_by: ADMIN_USER,
      },
    });
    expect(plan.events).toEqual([
      {
        content_id: CONTENT_ID,
        event_type: 'Link Replaced',
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: ADMIN_USER,
        occurred_at: CLOCK.now,
        event_data: {
          link: OTHER_REEL,
          platform: 'instagram',
          previous_link: REEL,
        },
      },
    ]);
    // AC 8: the content's submitted day, which lateness reads, stays the first hand-in's.
    expect(plan.result).toEqual({
      contentId: CONTENT_ID,
      status: 'link_submitted',
      submittedAt: '2026-10-05',
      links: [
        { platform: 'instagram', url: OTHER_REEL, submittedAt: '2026-10-10' },
      ],
    });
  });

  it('clears whatever performance numbers the link has in the same update', () => {
    const cleared = { views: null, likes: null };

    const plan = new ReplaceLink(
      { platform: 'instagram', url: OTHER_REEL },
      cleared,
    ).plan(linked(), creator, CLOCK);

    expect(plan.replace?.data).toMatchObject({
      views: null,
      likes: null,
      url: OTHER_REEL,
    });
  });

  it('lists the links in the order they were handed in after the swap', () => {
    const plan = new ReplaceLink(
      { platform: 'instagram', url: OTHER_REEL },
      NO_PERFORMANCE_COLUMNS,
    ).plan(
      linked({
        links: [
          { platform: 'instagram', url: REEL, submittedAt: '2026-10-05' },
          { platform: 'tiktok', url: VIDEO, submittedAt: '2026-10-07' },
        ],
      }),
      creator,
      CLOCK,
    );

    expect(plan.result.links.map((link) => link.platform)).toEqual([
      'tiktok',
      'instagram',
    ]);
  });

  it("reads the submitted day off the replaced link's first hand-in when the content kept none", () => {
    const plan = new ReplaceLink(
      { platform: 'instagram', url: OTHER_REEL },
      NO_PERFORMANCE_COLUMNS,
    ).plan(linked({ submittedAt: null }), creator, CLOCK);

    expect(plan.result.submittedAt).toBe('2026-10-05');
  });

  it('answers 404 when that platform has no link yet', () => {
    const error = refusal(() =>
      new ReplaceLink(
        { platform: 'tiktok', url: VIDEO },
        NO_PERFORMANCE_COLUMNS,
      ).plan(linked(), creator, CLOCK),
    );

    expect(error).toEqual({
      status: 404,
      body: {
        code: 'LINK_NOT_FOUND',
        message: 'Belum ada link TikTok untuk konten ini',
      },
    });
  });

  it('refuses the same video again, however it was copied, so no numbers are cleared for nothing', () => {
    expect(
      refusal(() =>
        new ReplaceLink(
          {
            platform: 'instagram',
            url: 'https://instagram.com/p/C9xYz?igsh=1',
          },
          NO_PERFORMANCE_COLUMNS,
        ).plan(linked(), creator, CLOCK),
      ),
    ).toEqual({
      status: 422,
      body: {
        message: 'Data link video tidak valid',
        errors: { instagram: 'Link baru sama dengan link yang sudah dikirim' },
      },
    });
  });

  it('refuses a replacement once the invoice is finalized', () => {
    expect(
      refusal(() =>
        new ReplaceLink(
          { platform: 'instagram', url: OTHER_REEL },
          NO_PERFORMANCE_COLUMNS,
        ).plan(linked({ invoice: 'finalized' }), admin, CLOCK),
      ).status,
    ).toBe(409);
  });
});

describe('error types', () => {
  it('uses the Nest exception each status belongs to', () => {
    const missing = () =>
      new ReplaceLink(
        { platform: 'tiktok', url: VIDEO },
        NO_PERFORMANCE_COLUMNS,
      ).plan(linked(), creator, CLOCK);
    const taken = () =>
      new SubmitLinks([{ platform: 'instagram', url: REEL }]).plan(
        linked(),
        creator,
        CLOCK,
      );
    const noAccount = () =>
      new SubmitLinks([{ platform: 'tiktok', url: VIDEO }]).plan(
        content({ accounts: [] }),
        creator,
        CLOCK,
      );

    expect(missing).toThrow(NotFoundException);
    expect(taken).toThrow(ConflictException);
    expect(noAccount).toThrow(UnprocessableEntityException);
  });
});
