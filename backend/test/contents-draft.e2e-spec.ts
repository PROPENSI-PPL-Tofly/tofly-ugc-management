import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { MOCK_CREATOR_HEADER } from '../src/contents/creator-identity.mock.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Rows created here carry this marker so the cleanup never touches anything else, and the
// review queue check searches for it so seeded drafts stay out of the assertions.
const MARKER = 'e2e-draft';

const DAY = 24 * 60 * 60 * 1000;

function daysFromToday(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      days * DAY,
  );
}

type Status =
  | 'scheduled'
  | 'draft_review'
  | 'draft_revision'
  | 'draft_revised'
  | 'draft_approved';

describe('POST /contents/:id/draft (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let strangerId: string;
  let contractId: string;

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
                start_date: daysFromToday(-30),
                end_date: daysFromToday(90),
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
    return user.creators!;
  }

  async function content(
    name: string,
    status: Status,
    options: { isProposal?: boolean; deadline?: Date } = {},
  ) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        deadline: options.deadline ?? daysFromToday(20),
        status,
        is_proposal: options.isProposal ?? false,
      },
    });
  }

  function handIn(
    contentId: string,
    body: object,
    as: string | null = ownerId,
  ) {
    const call = request(app.getHttpServer()).post(
      `/contents/${contentId}/draft`,
    );
    return (as ? call.set(MOCK_CREATOR_HEADER, as) : call).send(body);
  }

  async function stateOf(contentId: string) {
    return prisma.contents.findUniqueOrThrow({
      where: { id: contentId },
      select: {
        status: true,
        submissions: {
          orderBy: { created_at: 'asc' },
          select: { link: true, creator_notes: true, creator_id: true },
        },
      },
    });
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const owner = await creator('owner');
    ownerId = owner.id;
    contractId = owner.contracts[0].id;
    strangerId = (await creator('stranger')).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // Deleting the creator cascades to its contract, contents and submissions; the user row
    // is not cascaded from the creator, so it goes separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('hands in a first draft: 201, the content goes to review and the link and note are stored', async () => {
    const scheduled = await content('first draft', 'scheduled');

    const response = await handIn(scheduled.id, {
      link: ' https://drive.google.com/d/first ',
      notes: ' Musik sudah diganti ',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      contentId: scheduled.id,
      status: 'draft_review',
      link: 'https://drive.google.com/d/first',
      notes: 'Musik sudah diganti',
    });
    expect(await stateOf(scheduled.id)).toEqual({
      status: 'draft_review',
      submissions: [
        {
          link: 'https://drive.google.com/d/first',
          creator_notes: 'Musik sudah diganti',
          creator_id: ownerId,
        },
      ],
    });

    // A second hand-in while the first waits for review is refused and stores nothing.
    const again = await handIn(scheduled.id, {
      link: 'https://drive.google.com/d/again',
    });
    expect(again.status).toBe(409);
    expect((await stateOf(scheduled.id)).submissions).toHaveLength(1);
  });

  it('hands in a resubmit: the content becomes draft_revised and heads the admin review queue', async () => {
    const revision = await content('resubmit', 'draft_revision', {
      deadline: daysFromToday(60),
    });
    await content('waiting sooner', 'draft_review', {
      deadline: daysFromToday(2),
    }).then((waiting) =>
      prisma.submissions.create({
        data: {
          content_id: waiting.id,
          creator_id: ownerId,
          link: 'https://drive.google.com/d/waiting',
        },
      }),
    );

    const response = await handIn(revision.id, {
      link: 'https://drive.google.com/d/revised',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'draft_revised',
      notes: null,
    });

    const queue = await request(app.getHttpServer()).get(
      `/submissions?status=review&q=${MARKER}`,
    );
    expect(queue.body.items[0]).toMatchObject({
      submissionId: response.body.submissionId,
      status: 'draft_revised',
    });
  });

  it('answers 404 for another creator’s content and changes nothing (OWASP A01)', async () => {
    const scheduled = await content('not yours', 'scheduled');

    const response = await handIn(
      scheduled.id,
      { link: 'https://drive.google.com/d/stranger' },
      strangerId,
    );

    expect(response.status).toBe(404);
    expect(await stateOf(scheduled.id)).toEqual({
      status: 'scheduled',
      submissions: [],
    });
  });

  it('answers 404 for a proposal the admin has not approved', async () => {
    const proposal = await content('proposal', 'scheduled', {
      isProposal: true,
    });

    const response = await handIn(proposal.id, {
      link: 'https://drive.google.com/d/proposal',
    });

    expect(response.status).toBe(404);
    expect((await stateOf(proposal.id)).submissions).toHaveLength(0);
  });

  it('answers 409 once the draft is approved', async () => {
    const approved = await content('approved', 'draft_approved');

    const response = await handIn(approved.id, {
      link: 'https://drive.google.com/d/late',
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DRAFT_NOT_ELIGIBLE');
  });

  it('answers 401 to a caller who names no creator', async () => {
    const scheduled = await content('anonymous', 'scheduled');

    const response = await handIn(
      scheduled.id,
      { link: 'https://drive.google.com/d/anon' },
      null,
    );

    expect(response.status).toBe(401);
    expect((await stateOf(scheduled.id)).status).toBe('scheduled');
  });

  it('keeps one submission when two tabs hand in the same draft at once (OWASP A04)', async () => {
    const scheduled = await content('two tabs', 'scheduled');

    // Left alone, one request finishes before the other starts and the race never happens.
    // Holding the row lock lets both read "scheduled" and queue on the status update; once it
    // is released, only the status-guarded update stands between them and a second submission.
    let locked!: () => void;
    let release!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const lock = prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM contents WHERE id = ${scheduled.id}::uuid FOR UPDATE`;
        locked();
        await released;
      },
      { timeout: 10_000 },
    );
    await isLocked;

    const pending = Promise.all([
      handIn(scheduled.id, { link: 'https://drive.google.com/d/tab-1' }).then(
        (response) => response,
      ),
      handIn(scheduled.id, { link: 'https://drive.google.com/d/tab-2' }).then(
        (response) => response,
      ),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await lock;
    const responses = await pending;

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const state = await stateOf(scheduled.id);
    expect(state.status).toBe('draft_review');
    expect(state.submissions).toHaveLength(1);
  });
});
