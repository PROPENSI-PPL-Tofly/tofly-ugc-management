import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signInAsAdmin } from './sessions.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, and every request searches for it so seeded contents stay out of the assertions.
const MARKER = 'e2e-content-list';

type Status =
  | 'pending'
  | 'scheduled'
  | 'draft_review'
  | 'draft_revision'
  | 'draft_approved'
  | 'link_submitted';

interface Item {
  id: string;
  name: string;
  creatorId: string;
  status: Status;
  tags: string[];
  deadline: string;
}

function iso(offset: number): string {
  return day(offset).toISOString().slice(0, 10);
}

describe('GET /contents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /** Requests signed in as a whitelisted admin. */
  let admin: ReturnType<typeof as>;
  let dina: { creatorId: string; contractId: string };
  let raka: { creatorId: string; contractId: string };
  let resubmitId: string;

  async function creator(lastName: string) {
    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-${lastName.toLowerCase()}@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: lastName,
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

  async function content(
    owner: { creatorId: string; contractId: string },
    name: string,
    status: Status,
    deadlineOffset: number,
    extra: {
      handIns?: number;
      type?: 'evergreen' | 'specific';
      videoOffset?: number;
      bypassed?: boolean;
    } = {},
  ): Promise<string> {
    const created = await prisma.contents.create({
      data: {
        contract_id: owner.contractId,
        name: `${MARKER} ${name}`,
        type: extra.type ?? 'specific',
        deadline: day(deadlineOffset),
        status,
        approval_bypassed: extra.bypassed ?? false,
        ...(extra.videoOffset === undefined
          ? {}
          : {
              video_link: `https://video.example.com/${MARKER}/${name}`,
              video_submitted_at: day(extra.videoOffset),
            }),
      },
    });
    for (let i = 0; i < (extra.handIns ?? 0); i++) {
      await prisma.submissions.create({
        data: {
          content_id: created.id,
          creator_id: owner.creatorId,
          link: `https://drive.example.com/${MARKER}/${name}/${i}`,
          created_at: new Date(Date.UTC(2026, 8, 1 + i)),
        },
      });
    }
    return created.id;
  }

  function list(query = '') {
    return admin.get(`/contents?q=${MARKER}${query}`);
  }

  async function names(query = ''): Promise<string[]> {
    const response = await list(query);
    expect(response.status).toBe(200);
    return (response.body.items as Item[]).map((item) =>
      item.name.replace(`${MARKER} `, ''),
    );
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));

    dina = await creator('Dina');
    raka = await creator('Raka');

    await content(dina, 'overdue', 'scheduled', -3);
    await content(dina, 'late link', 'link_submitted', -2, {
      videoOffset: -1,
      bypassed: true,
    });
    await content(dina, 'scheduled', 'scheduled', 5);
    await content(dina, 'revision', 'draft_revision', 6, { handIns: 1 });
    await content(dina, 'approved', 'draft_approved', 7, { handIns: 1 });
    await content(dina, 'proposal', 'pending', 8);
    await content(dina, 'review', 'draft_review', 10, { handIns: 1 });
    resubmitId = await content(dina, 'resubmit', 'draft_review', 12, {
      handIns: 2,
    });
    await content(raka, 'evergreen', 'scheduled', 20, { type: 'evergreen' });
  });

  afterAll(async () => {
    // Deleting the creator cascades to its contract, contents and submissions; the user row
    // is not cascaded from the creator, so it goes separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('lists every creator\'s content by nearest deadline with a counter per tab', async () => {
    const response = await list();

    expect(response.status).toBe(200);
    expect(
      (response.body.items as Item[]).map((item) =>
        item.name.replace(`${MARKER} `, ''),
      ),
    ).toEqual([
      'overdue',
      'late link',
      'scheduled',
      'revision',
      'approved',
      'proposal',
      'review',
      'resubmit',
      'evergreen',
    ]);
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 9,
      totalPages: 1,
      tabCounts: { all: 9, needs_approval: 3, waiting_creator: 5, done: 1 },
    });
  });

  it('answers a row with exactly the table\'s fields', async () => {
    const response = await list('&status=draft_review&sort=deadline_desc');

    expect(response.body.items[0]).toEqual({
      id: resubmitId,
      name: `${MARKER} resubmit`,
      creatorId: dina.creatorId,
      creatorName: `${MARKER} Dina`,
      type: 'specific',
      deadline: iso(12),
      status: 'draft_review',
      tags: [],
      revisionCount: 1,
    });
  });

  it('tags a row from its real dates and stored bypass flag', async () => {
    const response = await list();
    const tagsOf = (name: string) =>
      (response.body.items as Item[]).find(
        (item) => item.name === `${MARKER} ${name}`,
      )?.tags;

    expect(tagsOf('overdue')).toEqual(['overdue']);
    expect(tagsOf('late link')).toEqual([
      'late_submission',
      'approval_bypassed',
    ]);
    expect(tagsOf('scheduled')).toEqual([]);
  });

  it.each([
    ['needs_approval', ['proposal', 'review', 'resubmit']],
    ['waiting_creator', ['overdue', 'scheduled', 'revision', 'approved', 'evergreen']],
    ['done', ['late link']],
  ])('lists the %s tab and still counts every tab', async (tab, expected) => {
    const response = await list(`&tab=${tab}`);

    expect(
      (response.body.items as Item[]).map((item) =>
        item.name.replace(`${MARKER} `, ''),
      ),
    ).toEqual(expected);
    expect(response.body.total).toBe(expected.length);
    expect(response.body.tabCounts).toEqual({
      all: 9,
      needs_approval: 3,
      waiting_creator: 5,
      done: 1,
    });
  });

  it('keeps only content tagged overdue, not everything past its deadline', async () => {
    expect(await names('&overdue=true')).toEqual(['overdue']);
  });

  it('narrows to one creator, or several', async () => {
    expect(await names(`&creator=${raka.creatorId}`)).toEqual(['evergreen']);
    expect(
      await names(`&creator=${raka.creatorId}&creator=${dina.creatorId}`),
    ).toHaveLength(9);
  });

  it('finds content by its creator\'s name', async () => {
    expect(await names('%20raka')).toEqual(['evergreen']);
  });

  it('narrows by type', async () => {
    expect(await names('&type=evergreen')).toEqual(['evergreen']);
  });

  it('narrows by several statuses and counts the tabs under them', async () => {
    const response = await list('&status=pending&status=link_submitted');

    expect(
      (response.body.items as Item[]).map((item) => item.status),
    ).toEqual(['link_submitted', 'pending']);
    expect(response.body.tabCounts).toEqual({
      all: 2,
      needs_approval: 1,
      waiting_creator: 0,
      done: 1,
    });
  });

  it('narrows by a deadline period, both days included', async () => {
    expect(
      await names(`&deadlineFrom=${iso(6)}&deadlineTo=${iso(8)}`),
    ).toEqual(['revision', 'approved', 'proposal']);
  });

  it('lists the furthest deadline first when asked', async () => {
    const sorted = await names('&sort=deadline_desc');

    expect(sorted[0]).toBe('evergreen');
    expect(sorted.at(-1)).toBe('overdue');
  });

  it('pages the list', async () => {
    const response = await list('&pageSize=4&page=3');

    expect(
      (response.body.items as Item[]).map((item) =>
        item.name.replace(`${MARKER} `, ''),
      ),
    ).toEqual(['evergreen']);
    expect(response.body).toMatchObject({
      page: 3,
      pageSize: 4,
      total: 9,
      totalPages: 3,
    });
  });

  it.each([
    ['an unknown tab', '&tab=archived'],
    ['a status the lifecycle dropped', '&status=draft_revised'],
    [
      'a creator that is not an id',
      `&creator=${encodeURIComponent("1' or '1'='1")}`,
    ],
    ['a page size over the cap', '&pageSize=500'],
  ])('answers 400 for %s', async (_, query) => {
    const response = await list(query);

    expect(response.status).toBe(400);
  });

  it('leaves the detail route beside it answering by id', async () => {
    const response = await admin.get(`/contents/${resubmitId}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(resubmitId);
  });
});
