import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { CreatorDetail } from '../src/creators/dto/creator-summary.dto.js';
import type { ContentListResponse } from '../src/contents/dto/content-list.dto.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-detail-hierarchy';

describe('Creator detail hierarchy (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creatorSession: ReturnType<typeof as>;
  let creatorId: string;
  let pastContract: string;
  let currentContract: string;
  let busyCreatorId: string;
  let busyContract: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));

    const user = await prisma.users.create({
      data: { email: `${MARKER}-sari@example.com` },
    });
    const creator = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} Sari`,
        phone_number: '081200000001',
        social_accounts: {
          create: {
            platform: 'tiktok',
            username: 'sari.creates',
            access_token: `${MARKER}-access-secret`,
            refresh_token: `${MARKER}-refresh-secret`,
          },
        },
        contracts: {
          create: [
            {
              start_date: day(-200),
              end_date: day(-20),
              contract_type: 'probation',
              days_between: 30,
              content_quota: 1,
              fixed_rate: 1000000,
              contents: {
                create: {
                  name: 'Periode lalu',
                  type: 'evergreen',
                  deadline: day(-60),
                  status: 'link_submitted',
                  video_submitted_at: day(-61),
                },
              },
            },
            {
              start_date: day(-19),
              end_date: day(160),
              contract_type: 'regular',
              days_between: 14,
              content_quota: 2,
              fixed_rate: 3000000,
              contents: {
                create: [
                  {
                    name: 'Periode kini',
                    type: 'evergreen',
                    deadline: day(10),
                  },
                  {
                    name: 'Usulan kreator',
                    type: 'specific',
                    deadline: day(20),
                    status: 'pending',
                  },
                ],
              },
            },
          ],
        },
      },
      include: { contracts: { orderBy: { start_date: 'asc' } } },
    });
    creatorId = creator.id;
    [pastContract, currentContract] = creator.contracts.map((c) => c.id);

    // A second creator, so the tree can be shown to hold nobody else's contents.
    const otherUser = await prisma.users.create({
      data: { email: `${MARKER}-lain@example.com` },
    });
    const other = await prisma.creators.create({
      data: {
        user_id: otherUser.id,
        first_name: `${MARKER} Lain`,
        contracts: {
          create: {
            start_date: day(-19),
            end_date: day(160),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1000000,
            contents: {
              create: {
                name: 'Milik orang lain',
                type: 'evergreen',
                deadline: day(10),
              },
            },
          },
        },
      },
    });

    // A period at the size the detail is promised to stay fast for: 30 contents, each with a
    // couple of hand-ins.
    const busyUser = await prisma.users.create({
      data: { email: `${MARKER}-ramai@example.com` },
    });
    const busy = await prisma.creators.create({
      data: {
        user_id: busyUser.id,
        first_name: `${MARKER} Ramai`,
        contracts: {
          create: {
            start_date: day(-19),
            end_date: day(160),
            contract_type: 'regular',
            days_between: 5,
            content_quota: 30,
            fixed_rate: 2000000,
          },
        },
      },
      include: { contracts: true },
    });
    busyCreatorId = busy.id;
    busyContract = busy.contracts[0].id;
    for (let index = 0; index < 30; index += 1) {
      await prisma.contents.create({
        data: {
          contract_id: busyContract,
          name: `${MARKER} Konten ${String(index + 1).padStart(2, '0')}`,
          type: 'evergreen',
          deadline: day(index * 5 - 15),
          status: 'draft_review',
          submissions: {
            create: [
              {
                creator_id: busyCreatorId,
                link: `https://example.com/${index}/v1`,
                revision_notes: 'Ulang',
              },
              {
                creator_id: busyCreatorId,
                link: `https://example.com/${index}/v2`,
              },
            ],
          },
        },
      });
    }

    creatorSession = as(
      app,
      await signIn(app, {
        userId: otherUser.id,
        role: 'creator',
        creatorId: other.id,
      }),
    );
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  describe('GET /creators/:id', () => {
    it('nests each contract period with its own contents, the past one included', async () => {
      const response = await admin.get(`/creators/${creatorId}`);

      expect(response.status).toBe(200);
      const detail = response.body as CreatorDetail;
      expect(
        detail.contractHistory.map((period) => ({
          id: period.id,
          periodNumber: period.periodNumber,
          type: period.type,
          status: period.status,
          isCurrent: period.isCurrent,
          fixedRate: period.fixedRate,
          remainingEvergreenQuota: period.remainingEvergreenQuota,
          progress: period.progress,
        })),
      ).toEqual([
        {
          id: pastContract,
          periodNumber: 1,
          type: 'probation',
          status: 'expired',
          isCurrent: false,
          fixedRate: 1000000,
          remainingEvergreenQuota: 0,
          progress: { submitted: 1, total: 1, percent: 100 },
        },
        {
          id: currentContract,
          periodNumber: 2,
          type: 'regular',
          status: 'active',
          isCurrent: true,
          fixedRate: 3000000,
          // One Evergreen scheduled out of two; the Specific proposal takes no slot.
          remainingEvergreenQuota: 1,
          // The pending proposal owes nothing yet.
          progress: { submitted: 0, total: 1, percent: 0 },
        },
      ]);
      expect(detail.contractHistory[0].performance.productivity).toBe('good');
    });

    it('leaves each period’s contents to GET /contents?contract=', async () => {
      const detail = (await admin.get(`/creators/${creatorId}`))
        .body as CreatorDetail;

      for (const period of detail.contractHistory) {
        expect(period).not.toHaveProperty('contents');
      }
    });

    it('answers within 300 ms for a period of 30 contents', async () => {
      // The first request warms the connection pool; the promise is about the ones after.
      await admin.get(`/creators/${busyCreatorId}`);

      const started = performance.now();
      const response = await admin.get(`/creators/${busyCreatorId}`);
      const elapsed = performance.now() - started;

      expect(response.status).toBe(200);
      expect((response.body as CreatorDetail).contents).toHaveLength(30);
      expect(elapsed).toBeLessThan(300);
    });

    it('keeps the flat current-period list the old modal reads', async () => {
      const detail = (await admin.get(`/creators/${creatorId}`))
        .body as CreatorDetail;

      expect(detail.contents.map((content) => content.name)).toEqual([
        'Periode kini',
        'Usulan kreator',
      ]);
    });

    it('sends no OAuth token and nobody else’s content (OWASP A01)', async () => {
      const response = await admin.get(`/creators/${creatorId}`);

      expect(response.text).not.toContain('secret');
      expect(response.text).not.toContain('Milik orang lain');
      expect(response.body.socials).toEqual({ tiktok: 'sari.creates' });
    });

    it('answers 403 to a signed-in creator, even for another creator’s id (OWASP A01)', async () => {
      const response = await creatorSession.get(`/creators/${creatorId}`);

      expect(response.status).toBe(403);
      expect(response.text).not.toContain('Sari');
    });

    it('answers 401 when signed out', async () => {
      const response = await request(app.getHttpServer()).get(
        `/creators/${creatorId}`,
      );

      expect(response.status).toBe(401);
    });

    it.each([
      ['not an id', 'sari'],
      ['an injection attempt', `${'0'.repeat(8)}' OR '1'='1`],
    ])(
      'answers 400 without detail when the id is %s (OWASP A03)',
      async (_, id) => {
        const response = await admin.get(`/creators/${encodeURIComponent(id)}`);

        expect(response.status).toBe(400);
        expect(response.text).not.toMatch(/prisma|stack|at \w+ \(/i);
      },
    );

    it('answers 404 with the same body for any unknown creator', async () => {
      const response = await admin.get(
        '/creators/00000000-0000-4000-8000-000000000000',
      );

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'CREATOR_NOT_FOUND' });
    });
  });

  describe('GET /contents?contract=', () => {
    it('lists one period’s contents and counts its tabs, proposals included', async () => {
      const response = await admin.get(`/contents?contract=${currentContract}`);

      expect(response.status).toBe(200);
      const list = response.body as ContentListResponse;
      expect(list.items.map((item) => item.name).sort()).toEqual([
        'Periode kini',
        'Usulan kreator',
      ]);
      expect(list.tabCounts).toEqual({
        all: 2,
        needs_approval: 1,
        waiting_creator: 1,
        done: 0,
      });
    });

    it('pages a period’s contents ten at a time and counts them all', async () => {
      const response = await admin.get(
        `/contents?contract=${busyContract}&pageSize=10`,
      );

      const list = response.body as ContentListResponse;
      expect(list.items).toHaveLength(10);
      expect(list.total).toBe(30);
      expect(list.totalPages).toBe(3);
    });

    it('keeps an earlier period apart from the current one', async () => {
      const list = (await admin.get(`/contents?contract=${pastContract}`))
        .body as ContentListResponse;

      expect(list.items.map((item) => item.name)).toEqual(['Periode lalu']);
    });

    it('answers 400 to a contract that is not an id (OWASP A03)', async () => {
      const response = await admin.get(
        `/contents?contract=${encodeURIComponent(`${currentContract}' OR 1=1--`)}`,
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('contract must be a contract id');
    });

    it('answers 403 to a creator (OWASP A01)', async () => {
      const response = await creatorSession.get(
        `/contents?contract=${currentContract}`,
      );

      expect(response.status).toBe(403);
    });
  });
});
