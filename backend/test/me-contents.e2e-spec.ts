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
  | 'pending'
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
  ) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name,
        type: 'evergreen',
        deadline: day(offset),
        status,
        // A submitted link always carries its link and day, as POST /contents/:id/video sets them.
        ...(status === 'link_submitted' && {
          video_link: 'https://www.instagram.com/reel/e2e/',
          video_submitted_at: day(offset - 1),
        }),
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
    const revision = await content(a.contractId, 'Revision', 'draft_revision', 12);
    await prisma.submissions.create({
      data: {
        content_id: revision.id,
        creator_id: dina,
        link: 'https://drive.google.com/e2e',
        revision_notes: 'Perjelas intro',
      },
    });
    await content(a.contractId, 'Approved', 'draft_approved', 30);
    await content(a.contractId, 'Tomorrow', 'scheduled', 1);
    await content(a.contractId, 'In review', 'draft_review', 20);
    await content(a.contractId, 'Overdue', 'scheduled', -2);
    await content(a.contractId, 'Far away', 'scheduled', 40);
    await content(a.contractId, 'Pending proposal', 'pending', 5);
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

  const names = (response: { body: { items: { name: string }[] } }) =>
    response.body.items.map((item) => item.name);

  it('lists open work by nearest deadline and finished work after it, ten a page, each with its actions and every tab counted', async () => {
    const response = await list(dina);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 7,
      totalPages: 1,
      tabCounts: { all: 7, to_do: 5, waiting_admin: 1, done: 1 },
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
      ['Overdue', iso(-2), ['submit_draft']],
      ['Tomorrow', iso(1), ['submit_draft']],
      ['Revision', iso(12), ['resubmit_draft']],
      ['In review', iso(20), []],
      ['Approved', iso(30), ['submit_video']],
      ['Far away', iso(40), ['submit_draft']],
      ['Submitted long ago', iso(-20), []],
    ]);
    expect(
      response.body.items.map(
        (item: { revisionNotes: string | null }) => item.revisionNotes,
      ),
    ).toEqual([null, null, 'Perjelas intro', null, null, null, null]);
  });

  it('turns the order around for the furthest deadline first', async () => {
    const response = await list(dina, '?sort=deadline_desc&pageSize=2');

    expect(names(response)).toEqual(['Far away', 'Approved']);
    expect(response.body).toMatchObject({ total: 7, totalPages: 4 });
  });

  it.each([
    ['to_do', ['Overdue', 'Tomorrow', 'Revision', 'Approved', 'Far away']],
    ['waiting_admin', ['In review']],
    ['done', ['Submitted long ago']],
  ])('lists only the %s tab, keeping every counter', async (tab, expected) => {
    const response = await list(dina, `?tab=${tab}`);

    expect(response.status).toBe(200);
    expect(names(response)).toEqual(expected);
    expect(response.body.tabCounts).toEqual({
      all: 7,
      to_do: 5,
      waiting_admin: 1,
      done: 1,
    });
  });

  it('never lets a period hide work to do, while Semua and the other tabs keep to it', async () => {
    const period = `deadlineFrom=${iso(10)}&deadlineTo=${iso(35)}`;

    const semua = await list(dina, `?${period}`);
    const toDo = await list(dina, `?tab=to_do&${period}`);

    expect(names(semua)).toEqual(['Revision', 'In review', 'Approved']);
    expect(names(toDo)).toEqual([
      'Overdue',
      'Tomorrow',
      'Revision',
      'Approved',
      'Far away',
    ]);
    expect(semua.body.tabCounts).toEqual({
      all: 3,
      to_do: 5,
      waiting_admin: 1,
      done: 0,
    });
  });

  it('moves a draft in review to Perlu Dikerjakan once its H-1 link is open, whatever the period', async () => {
    const tari = await creator('tari');
    await content(tari.contractId, 'Review due tomorrow', 'draft_review', 1);
    await content(tari.contractId, 'Review due later', 'draft_review', 9);
    const period = `deadlineFrom=${iso(5)}&deadlineTo=${iso(15)}`;

    const toDo = await list(tari.creatorId, `?tab=to_do&${period}`);
    const waiting = await list(tari.creatorId, `?tab=waiting_admin&${period}`);

    expect(names(toDo)).toEqual(['Review due tomorrow']);
    expect(toDo.body.items[0].actions).toEqual(['submit_video']);
    expect(names(waiting)).toEqual(['Review due later']);
    expect(toDo.body.tabCounts).toEqual({
      all: 1,
      to_do: 1,
      waiting_admin: 1,
      done: 0,
    });
  });

  it('searches the name whatever its case, and counts only what it finds', async () => {
    const response = await list(dina, '?q=REVIS');

    expect(names(response)).toEqual(['Revision']);
    expect(response.body.tabCounts).toEqual({
      all: 1,
      to_do: 1,
      waiting_admin: 0,
      done: 0,
    });
  });

  it('keeps only what is past its deadline with no link when overdue is asked', async () => {
    const response = await list(dina, '?overdue=true');

    expect(names(response)).toEqual(['Overdue']);
  });

  it('narrows by type in the query, leaving every counter at zero when nothing matches', async () => {
    const response = await list(dina, '?type=specific');

    expect(response.body).toMatchObject({
      items: [],
      total: 0,
      tabCounts: { all: 0, to_do: 0, waiting_admin: 0, done: 0 },
    });
  });

  it('narrows the rows by several statuses at once without changing a counter', async () => {
    const response = await list(
      dina,
      '?tab=to_do&status=draft_revision&status=draft_approved',
    );

    expect(names(response)).toEqual(['Revision', 'Approved']);
    expect(response.body).toMatchObject({ total: 2 });
    expect(response.body.tabCounts.to_do).toBe(5);
  });

  // Finished in the opposite order to their deadlines: the list still follows the deadline.
  it('orders finished tasks by deadline, not by when their link was sent, after what is still open', async () => {
    const sari = await creator('sari');
    const finished = (name: string, deadline: number, sent: number) =>
      prisma.contents.create({
        data: {
          contract_id: sari.contractId,
          name,
          type: 'evergreen',
          deadline: day(deadline),
          status: 'link_submitted',
          video_link: 'https://www.instagram.com/reel/e2e/',
          video_submitted_at: day(sent),
        },
      });
    await finished('Sent recently', -10, -2);
    await finished('Sent long ago', -30, -25);
    await content(sari.contractId, 'Still open', 'scheduled', 7);

    const response = await list(sari.creatorId);

    expect(
      response.body.items.map((item: { name: string }) => item.name),
    ).toEqual(['Still open', 'Sent long ago', 'Sent recently']);
  });

  it.each([
    ['a status Task Saya does not know', '?status=draft_revised'],
    ['a pending proposal', '?status=pending'],
    ['the admin’s tab name', '?tab=needs_approval'],
    ['the page’s short sort name', '?sort=asc'],
    ['a period that ends before it starts', `?deadlineFrom=${iso(5)}&deadlineTo=${iso(1)}`],
  ])('answers 400 for %s', async (_label, query) => {
    const response = await list(dina, query);

    expect(response.status).toBe(400);
  });

  it('returns only the fields a row needs', async () => {
    const response = await list(dina, '?pageSize=1');

    expect(Object.keys(response.body.items[0]).sort()).toEqual([
      'actions',
      'brief',
      'deadline',
      'id',
      'name',
      'revisionNotes',
      'status',
      'tags',
      'type',
    ]);
    // The tags are judged on the link and bypass columns; those columns stay on the server.
    expect(response.body.items[0]).not.toHaveProperty('video_submitted_at');
    expect(response.body.items[0]).not.toHaveProperty('approval_bypassed');
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
