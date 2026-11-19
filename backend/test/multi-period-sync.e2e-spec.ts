import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { CreatorsService } from '../src/creators/creators.service.js';
import type {
  PerformanceSource,
  SourceResult,
} from '../src/performance/ports.js';
import {
  PERFORMANCE_SOURCES,
  PerformanceSyncService,
} from '../src/performance/sync/performance-sync.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';
import { as, signInAsAdmin } from './sessions.js';

// PBI-30.2 (PBI-30 AC 6): a renewed creator's connected account carries into the new period, so
// its links sync without reconnecting, while the earlier period's finalized invoice keeps its
// numbers frozen. A regression test: no production code changed for this.
//
// TEST FIXTURE, NOT PRODUCTION: the second period is inserted straight into `contracts`, as
// PBI-30.1's endpoint will leave it. The platform is a stand-in (PERFORMANCE_SOURCES), as in
// performance-sync.e2e-spec.ts; no request leaves the machine.

const MARKER = 'e2e-multi-period-sync';
const METRICS = { views: 12400, likes: 830, comments: 41, shares: null };
let videoSeq = 7700000000000000000n;
const tiktok = () => `https://www.tiktok.com/@tofly/video/${(videoSeq += 1n)}`;

describe('Connected accounts and sync across periods (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  /** Which creator each platform read was made for. */
  const readsFor: string[] = [];
  const tiktokSource: PerformanceSource = {
    platform: 'tiktok',
    read: async (creatorId, links): Promise<SourceResult> => {
      readsFor.push(creatorId);
      return {
        outcome: 'read',
        readings: links.map((link) => ({
          linkId: link.id,
          outcome: 'synced',
          metrics: METRICS,
        })),
      };
    },
  };
  let creatorId: string;
  let userId: string;
  let ended: string;
  let current: string;

  function delivered(contractId: string) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} content`,
        type: 'evergreen',
        deadline: day(-1),
        status: 'link_submitted',
        video_submitted_at: day(-3),
        content_links: {
          create: [storedLink(tiktok(), day(-3), userId, 'tiktok')],
        },
      },
    });
  }

  const linkOf = (contentId: string) =>
    prisma.content_links.findFirstOrThrow({ where: { content_id: contentId } });

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PERFORMANCE_SOURCES)
      .useValue([tiktokSource])
      .compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await signInAsAdmin(app, prisma, MARKER);

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-creator@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: 'renewed',
            // Connected once, during period 1; nothing about it names a period.
            social_accounts: {
              create: {
                platform: 'tiktok',
                username: `${MARKER}-renewed`,
                is_connected: true,
                platform_user_id: `${MARKER}-open-id`,
                connected_at: day(-50),
              },
            },
            contracts: {
              create: [
                [-60, -1],
                [0, 90],
              ].map(([start, end]) => ({
                start_date: day(start),
                end_date: day(end),
                contract_type: 'regular' as const,
                days_between: 14,
                content_quota: 4,
                fixed_rate: 100000,
              })),
            },
          },
        },
      },
      include: {
        creators: {
          include: { contracts: { orderBy: { start_date: 'asc' } } },
        },
      },
    });
    userId = user.id;
    creatorId = user.creators!.id;
    [ended, current] = user.creators!.contracts.map(({ id }) => id);
    // Period 1's invoice was finalized when it ended.
    await prisma.invoices.create({
      data: {
        contract_id: ended,
        status: 'finalized',
        finalized_at: day(0),
        snapshot: {},
      },
    });
  });

  beforeEach(() => {
    readsFor.length = 0;
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  it('syncs a new-period link through the account connected in period 1, with no reconnect', async () => {
    const made = await delivered(current);

    const response = await as(app, admin).post(
      `/contents/${made.id}/performance-sync`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ notUpdated: [] });
    expect(readsFor).toEqual([creatorId]);
    expect(await linkOf(made.id)).toMatchObject({
      ...METRICS,
      data_state: 'synced',
    });
  });

  it("keeps period 1's finalized numbers frozen while period 2 syncs", async () => {
    const frozen = await delivered(ended);
    await prisma.content_links.updateMany({
      where: { content_id: frozen.id },
      data: { views: 500, data_state: 'synced' },
    });
    const fresh = await delivered(current);

    const refused = await as(app, admin).post(
      `/contents/${frozen.id}/performance-sync`,
    );
    const contract = await app
      .get(PerformanceSyncService)
      .syncContract(current);

    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('SYNC_NOT_ALLOWED');
    expect(contract).toEqual({ notUpdated: [] });
    expect(await linkOf(frozen.id)).toMatchObject({
      views: 500,
      data_state: 'synced',
    });
    expect((await linkOf(fresh.id)).data_state).toBe('synced');
  });

  it('shows Admin the account still connected and the creator on period 2', async () => {
    const detail = await new CreatorsService(prisma).findOne(creatorId);

    expect(detail.socialConnections?.tiktok?.connected).toBe(true);
    expect(detail.contract).toMatchObject({
      status: 'active',
      periodNumber: 2,
    });
  });
});
