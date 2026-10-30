import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { normalizeVideoLink } from '../src/contents/content-links.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';

// Rows created here carry this marker so the cleanup never touches anything else.
const MARKER = 'e2e-content-links';

const MIGRATIONS = join(import.meta.dirname, '..', 'prisma', 'migrations');

/** The migration that moves links into content_links, read as CI and staging run it. */
function linksMigration(): string {
  const [folder] = readdirSync(MIGRATIONS).filter((name) =>
    name.endsWith('_content_links'),
  );
  return readFileSync(join(MIGRATIONS, folder, 'migration.sql'), 'utf8');
}

/** One statement of the migration, between its `-- <name>: begin` and `-- <name>: end` lines. */
function statement(name: string): string {
  const sql = linksMigration();
  const begin = sql.indexOf(`-- ${name}: begin`);
  const end = sql.indexOf(`-- ${name}: end`);
  if (begin < 0 || end < begin) {
    throw new Error(`migration has no "${name}" block`);
  }
  return sql.slice(sql.indexOf('\n', begin) + 1, end);
}

/** Thrown to undo a transaction once what it showed has been read. */
class Rollback extends Error {}

describe('content_links (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let contractId: string;

  async function content(name: string, link?: Partial<{
    video_link: string;
    video_submitted_at: Date;
    platform: 'instagram' | 'tiktok';
  }>) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        deadline: day(5),
        status: link ? 'link_submitted' : 'draft_approved',
        ...link,
      },
    });
  }

  function link(
    contentId: string,
    url: string,
    platform: 'instagram' | 'tiktok' | null,
  ) {
    return prisma.content_links.create({
      data: {
        content_id: contentId,
        platform,
        url,
        normalized_url: normalizeVideoLink(url),
        submitted_at: day(0),
        submitted_by: userId,
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-owner@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: 'owner',
            contracts: {
              create: {
                start_date: day(-30),
                end_date: day(90),
                contract_type: 'regular',
                days_between: 14,
                content_quota: 4,
                fixed_rate: 100000,
              },
            },
          },
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    userId = user.id;
    contractId = user.creators!.contracts[0].id;
  });

  afterAll(async () => {
    // Deleting the creator cascades to its contract, contents and their links.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  describe('one link per platform, one content per video (AC 1, 5)', () => {
    it('keeps an Instagram and a TikTok link on one content', async () => {
      const crossPosted = await content('cross-posted');

      await link(crossPosted.id, 'https://www.instagram.com/reel/e2eCross/', 'instagram');
      await link(crossPosted.id, 'https://www.tiktok.com/@e2e/video/1001', 'tiktok');

      expect(
        await prisma.content_links.count({ where: { content_id: crossPosted.id } }),
      ).toBe(2);
    });

    it('refuses a second link for the same platform on one content', async () => {
      const once = await content('one per platform');
      await link(once.id, 'https://www.instagram.com/reel/e2eFirst/', 'instagram');

      await expect(
        link(once.id, 'https://www.instagram.com/reel/e2eSecond/', 'instagram'),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('refuses a video already stored on another content, however its link was copied', async () => {
      const first = await content('video owner');
      const second = await content('video copy');
      await link(first.id, 'https://www.instagram.com/reel/e2eTaken/', 'instagram');

      await expect(
        link(second.id, 'http://instagram.com/reel/e2eTaken?igsh=abc', 'instagram'),
      ).rejects.toMatchObject({
        code: 'P2002',
        meta: { target: ['normalized_url'] },
      });
    });

    it('refuses a stored key that is not the key of its link', async () => {
      const forged = await content('forged key');

      await expect(
        prisma.content_links.create({
          data: {
            content_id: forged.id,
            platform: 'tiktok',
            url: 'https://www.tiktok.com/@e2e/video/2002',
            normalized_url: 'tiktok.com/@e2e/video/something-else',
            submitted_at: day(0),
            submitted_by: userId,
          },
        }),
      ).rejects.toThrow(/content_links_normalized_url_check/);
    });

    it('drops a content item\'s links with it', async () => {
      const gone = await content('deleted');
      await link(gone.id, 'https://www.tiktok.com/@e2e/video/3003', 'tiktok');

      await prisma.contents.delete({ where: { id: gone.id } });

      expect(await prisma.content_links.count({ where: { content_id: gone.id } })).toBe(0);
    });
  });

  describe('content_link_key, the database half of normalizeVideoLink', () => {
    it.each([
      'https://www.instagram.com/reel/C9xYz/',
      'http://INSTAGRAM.com/reel/C9xYz?igsh=abc#top',
      'https://www.tiktok.com/@creator/video/7312345678901234567',
      'https://vm.tiktok.com/ZMabc123//',
      'https://wwwinstagram.com/reel/x',
      'https://example.com',
      'https://example.com/video/seeded-link/',
      ' Not-A-Link ',
    ])('keys %j as the application does', async (url) => {
      const [{ key }] = await prisma.$queryRaw<{ key: string }[]>`
        select content_link_key(${url}) as key`;

      expect(key).toBe(normalizeVideoLink(url));
    });
  });

  describe('moving the links handed in before this change (AC 2)', () => {
    /** Runs the migration's check and copy on the rows `seed` adds, then undoes everything. */
    async function migrate<T>(
      seed: (tx: Prisma.TransactionClient) => Promise<void>,
      read: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
      let seen: T | undefined;
      await prisma
        .$transaction(async (tx) => {
          await seed(tx);
          await tx.$executeRawUnsafe(statement('backfill check'));
          await tx.$executeRawUnsafe(statement('backfill copy'));
          seen = await read(tx);
          throw new Rollback();
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error;
        });
      return seen as T;
    }

    function old(
      tx: Prisma.TransactionClient,
      name: string,
      link: {
        video_link: string;
        video_submitted_at: Date | null;
        platform: 'instagram' | 'tiktok' | null;
      },
    ) {
      return tx.contents.create({
        data: {
          contract_id: contractId,
          name: `${MARKER} old ${name}`,
          type: 'specific',
          deadline: day(-10),
          status: 'link_submitted',
          ...link,
        },
      });
    }

    async function moved(tx: Prisma.TransactionClient) {
      return tx.content_links.findMany({
        where: { contents: { name: { startsWith: `${MARKER} old` } } },
        orderBy: { url: 'asc' },
        select: {
          url: true,
          normalized_url: true,
          platform: true,
          submitted_at: true,
          submitted_by: true,
          contents: { select: { name: true } },
        },
      });
    }

    it('copies every old link with its platform, day and creator, one row per link', async () => {
      const rows = await migrate(
        async (tx) => {
          await old(tx, 'instagram', {
            video_link: 'https://www.instagram.com/reel/e2eOld/',
            video_submitted_at: day(-12),
            platform: 'instagram',
          });
          await old(tx, 'tiktok', {
            video_link: 'https://www.tiktok.com/@e2e/video/4004',
            video_submitted_at: day(-11),
            platform: 'tiktok',
          });
        },
        moved,
      );

      expect(rows).toEqual([
        {
          url: 'https://www.instagram.com/reel/e2eOld/',
          normalized_url: 'instagram.com/reel/e2eOld',
          platform: 'instagram',
          submitted_at: day(-12),
          submitted_by: userId,
          contents: { name: `${MARKER} old instagram` },
        },
        {
          url: 'https://www.tiktok.com/@e2e/video/4004',
          normalized_url: 'tiktok.com/@e2e/video/4004',
          platform: 'tiktok',
          submitted_at: day(-11),
          submitted_by: userId,
          contents: { name: `${MARKER} old tiktok` },
        },
      ]);
    });

    it('reads the platform off the host when none was recorded, and keeps any other link without one', async () => {
      const rows = await migrate(
        async (tx) => {
          await old(tx, 'unrecorded instagram', {
            video_link: 'https://instagram.com/p/e2eNoPlatform',
            video_submitted_at: day(-9),
            platform: null,
          });
          await old(tx, 'unrecorded tiktok', {
            video_link: 'https://vt.tiktok.com/e2eNoPlatform/',
            video_submitted_at: day(-9),
            platform: null,
          });
          await old(tx, 'seeded', {
            video_link: 'https://example.com/video/e2e-seeded',
            video_submitted_at: day(-9),
            platform: null,
          });
        },
        moved,
      );

      expect(rows.map(({ url, platform }) => ({ url, platform }))).toEqual([
        { url: 'https://example.com/video/e2e-seeded', platform: null },
        { url: 'https://instagram.com/p/e2eNoPlatform', platform: 'instagram' },
        { url: 'https://vt.tiktok.com/e2eNoPlatform/', platform: 'tiktok' },
      ]);
    });

    it('dates a link that kept no day by the day its content last changed', async () => {
      const rows = await migrate(
        async (tx) => {
          await old(tx, 'undated', {
            video_link: 'https://www.instagram.com/reel/e2eUndated/',
            video_submitted_at: null,
            platform: 'instagram',
          });
        },
        moved,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].submitted_at).toEqual(day(0));
    });

    it('moves nothing twice when it runs again', async () => {
      const count = await migrate(
        async (tx) => {
          await old(tx, 'rerun', {
            video_link: 'https://www.tiktok.com/@e2e/video/5005',
            video_submitted_at: day(-3),
            platform: 'tiktok',
          });
          await tx.$executeRawUnsafe(statement('backfill copy'));
        },
        async (tx) => (await moved(tx)).length,
      );

      expect(count).toBe(1);
    });

    it('stops, naming the video, rather than drop one of two contents holding the same video', async () => {
      await expect(
        migrate(
          async (tx) => {
            await old(tx, 'twice a', {
              video_link: 'https://www.instagram.com/reel/e2eTwice/',
              video_submitted_at: day(-5),
              platform: 'instagram',
            });
            await old(tx, 'twice b', {
              video_link: 'http://instagram.com/reel/e2eTwice',
              video_submitted_at: day(-4),
              platform: 'instagram',
            });
          },
          moved,
        ),
      ).rejects.toThrow(/instagram\.com\/reel\/e2eTwice/);
    });
  });
});
