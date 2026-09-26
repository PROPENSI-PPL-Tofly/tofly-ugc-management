import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { jakartaDay } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database. Both creators are new, so every row they list was made by this file.
const MARKER = 'e2e-me-contents';

const DAY = 24 * 60 * 60 * 1000;

// Offsets from today in WIB, the "today" the action rules use.
const TODAY = jakartaDay(new Date());

function day(offset: number): Date {
  return new Date(new Date(`${TODAY}T00:00:00.000Z`).getTime() + offset * DAY);
}

function iso(offset: number): string {
  return day(offset).toISOString().slice(0, 10);
}

type Status =
  | 'scheduled'
  | 'draft_review'
  | 'draft_revision'
  | 'draft_approved'
  | 'link_submitted';

describe('GET /me/contents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dina: string;
  let raka: string;

  async function creator(name: string) {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${name}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: name,
            contracts: {
              create: {
                start_date: day(-60),
                end_date: day(120),
                contract_type: 'regular',
                days_between: 14,
                content_quota: 8,
                fixed_rate: 100000,
              },
            },
          },
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    return {
      creatorId: user.creators!.id,
      contractId: user.creators!.contracts[0].id,
    };
  }

  function content(
    contractId: string,
    name: string,
    status: Status,
    offset: number,
    isProposal = false,
  ) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name,
        type: 'evergreen',
        deadline: day(offset),
        status,
        is_proposal: isProposal,
      },
    });
  }

  function list(creatorId: string, query = '') {
    return request(app.getHttpServer())
      .get(`/me/contents${query}`)
      .set('X-Dev-Creator-Id', creatorId);
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('DEV_CREATOR_ID', '');

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const a = await creator('dina');
    const b = await creator('raka');
    dina = a.creatorId;
    raka = b.creatorId;

    await content(a.contractId, 'Submitted long ago', 'link_submitted', -20);
    await content(a.contractId, 'Revision', 'draft_revision', 12);
    await content(a.contractId, 'Approved', 'draft_approved', 30);
    await content(a.contractId, 'Tomorrow', 'scheduled', 1);
    await content(a.contractId, 'In review', 'draft_review', 20);
    await content(a.contractId, 'Overdue', 'scheduled', -2);
    await content(a.contractId, 'Far away', 'scheduled', 40);
    await content(a.contractId, 'Pending proposal', 'scheduled', 5, true);
    await content(b.contractId, 'Raka only', 'scheduled', 3);
  });

  afterAll(async () => {
    // Deleting the creator cascades to its contract and contents; the user row is not
    // cascaded from the creator, so it goes separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  it('lists the first 5 tasks by nearest deadline, each with its actions', async () => {
    const response = await list(dina);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 5,
      total: 7,
      totalPages: 2,
    });
    expect(
      response.body.items.map(
        (item: { name: string; deadline: string; actions: string[] }) => [
          item.name,
          item.deadline,
          item.actions,
        ],
      ),
    ).toEqual([
      ['Submitted long ago', iso(-20), []],
      ['Overdue', iso(-2), ['submit_draft', 'submit_video']],
      ['Tomorrow', iso(1), ['submit_draft', 'submit_video']],
      ['Revision', iso(12), ['resubmit_draft']],
      ['In review', iso(20), []],
    ]);
  });

  it('continues by deadline on the last page', async () => {
    const response = await list(dina, '?page=2');

    expect(response.status).toBe(200);
    expect(
      response.body.items.map((item: { name: string }) => item.name),
    ).toEqual(['Approved', 'Far away']);
  });

  it('returns only the fields a row needs', async () => {
    const response = await list(dina, '?pageSize=1');

    expect(Object.keys(response.body.items[0]).sort()).toEqual([
      'actions',
      'brief',
      'deadline',
      'id',
      'name',
      'status',
      'type',
    ]);
  });

  it("never shows one creator another creator's contents or a pending proposal", async () => {
    const dinaAll = await list(dina, '?pageSize=50');
    const rakaAll = await list(raka, '?pageSize=50');

    const dinaNames = dinaAll.body.items.map(
      (item: { name: string }) => item.name,
    );
    expect(dinaNames).not.toContain('Raka only');
    expect(dinaNames).not.toContain('Pending proposal');
    expect(
      rakaAll.body.items.map((item: { name: string }) => item.name),
    ).toEqual(['Raka only']);
  });

  it.each([
    ['no identity', undefined],
    [
      'a creator id that does not exist',
      '00000000-0000-4000-8000-000000000000',
    ],
    ['a malformed id', `${MARKER}' OR '1'='1`],
  ])('answers 401 for %s', async (_label, header) => {
    const call = request(app.getHttpServer()).get('/me/contents');
    const response = await (header
      ? call.set('X-Dev-Creator-Id', header)
      : call);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('answers 401 once dev auth is switched off', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'false');
    try {
      const response = await list(dina);
      expect(response.status).toBe(401);
    } finally {
      vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    }
  });

  it('answers 400 for a page size above the cap', async () => {
    const response = await list(dina, '?pageSize=1000');

    expect(response.status).toBe(400);
  });
});
