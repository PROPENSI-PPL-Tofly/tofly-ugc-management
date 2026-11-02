import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { storedLink } from './links.js';
import { useFormula } from './rate-formula-fixture.js';
import { as, signInAsAdmin } from './sessions.js';

// The performance bonus as 27.1 leaves it (PBI-27 Done-when), against the real schema: one
// content, one calculation, judged on the platform of its first link handed in and on that same
// link's number for the platform's metric. No bonus per link and no sum across platforms: that
// is PBI-28.1.
const MARKER = 'e2e-performance-invoice';

describe('performance bonus from the primary link (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let restoreFormula: () => Promise<void>;
  let seq = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    restoreFormula = await useFormula(app, prisma, {
      latePenaltyPerDay: 50_000,
      maxPenaltyDays: 3,
      specificBonus: 100_000,
      performanceBonus: {
        // Judged on comments, one of the two metrics no content column ever held.
        instagram: {
          metric: 'comments',
          tiers: [{ threshold: 10, bonus: 50_000 }],
        },
        tiktok: {
          metric: 'views',
          tiers: [{ threshold: 10_000, bonus: 150_000 }],
        },
      },
    });
  });

  afterAll(async () => {
    await restoreFormula();
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  /** An ended contract whose one Evergreen video was handed in on time on both platforms. */
  async function crossPosted(instagramFirst: boolean): Promise<string> {
    const user = await prisma.users.create({
      data: { email: `${MARKER}-${(seq += 1)}@example.com` },
    });
    const first = instagramFirst ? 'instagram' : 'tiktok';
    const instagram = {
      ...storedLink(
        `https://www.instagram.com/reel/${MARKER}-${seq}/`,
        day(instagramFirst ? -6 : -4),
        user.id,
        'instagram',
      ),
      views: 90_000,
      comments: 12,
    };
    const tiktok = {
      ...storedLink(
        `https://www.tiktok.com/@tofly/video/77${String(seq).padStart(17, '0')}`,
        day(instagramFirst ? -4 : -6),
        user.id,
        'tiktok',
      ),
      views: 50_000,
      comments: 0,
    };
    const creator = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: MARKER,
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(-1),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1_000_000,
            contents: {
              create: {
                name: `${MARKER} ${first} first`,
                type: 'evergreen',
                deadline: day(-3),
                status: 'link_submitted',
                video_submitted_at: day(-6),
                content_links: { create: [instagram, tiktok] },
              },
            },
          },
        },
      },
      select: { contracts: { select: { id: true } } },
    });
    return creator.contracts[0].id;
  }

  async function frozenBonus(contractId: string) {
    const { body } = await admin
      .post(`/invoices/${contractId}/finalize`)
      .expect(201);
    return body.snapshot.performanceBonus;
  }

  it("judges a cross-posted content once, on its first link's platform and that link's own number", async () => {
    const bonus = await frozenBonus(await crossPosted(true));

    // Instagram was handed in first: its 12 comments reach the tier. TikTok's 50,000 views
    // would also reach TikTok's tier, but a second link earns no second line and no sum.
    expect(bonus).toMatchObject({ amount: 50_000, status: 'calculated' });
    expect(bonus.lines).toHaveLength(1);
    expect(bonus.lines[0].basis).toEqual({
      platform: 'instagram',
      metric: 'comments',
      value: 12,
      tier: 1,
    });
  });

  it('follows whichever link was handed in first, reading that link and not the other', async () => {
    const bonus = await frozenBonus(await crossPosted(false));

    expect(bonus).toMatchObject({ amount: 150_000, status: 'calculated' });
    expect(bonus.lines).toHaveLength(1);
    expect(bonus.lines[0].basis).toEqual({
      platform: 'tiktok',
      metric: 'views',
      value: 50_000,
      tier: 1,
    });
  });
});
