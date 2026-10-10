import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DEV_CREATOR_HEADER } from '../src/auth/dev-creator.guard.js';
import { ContentEventHistoryService } from '../src/contents/content-event-history.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MARKER = `e2e-creator-comment-${randomUUID()}`;
const COMMENT = 'I uploaded the revised opening scene.';
const PROFILE_NAME = 'Dina Ayu Pratama';

describe('POST /contents/:id/comments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let history: ContentEventHistoryService;
  let ownerId: string;
  let strangerId: string;
  let userIds: string[] = [];
  let contractId: string;

  async function createContent(name: string) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type: 'specific',
        deadline: new Date('2099-12-31T00:00:00.000Z'),
        status: 'scheduled',
      },
    });
  }

  function postComment(
    contentId: string,
    body: unknown,
    creatorId: string | null = ownerId,
  ) {
    const call = request(app.getHttpServer()).post(
      `/contents/${contentId}/comments`,
    );
    return (creatorId ? call.set(DEV_CREATOR_HEADER, creatorId) : call).send(
      body as object,
    );
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    history = app.get(ContentEventHistoryService);

    const owner = await prisma.users.create({
      data: {
        email: `${MARKER}-owner@example.test`,
        creators: {
          create: {
            first_name: 'Dina',
            middle_name: 'Ayu',
            last_name: 'Pratama',
            contracts: {
              create: {
                start_date: new Date('2026-01-01T00:00:00.000Z'),
                end_date: new Date('2099-12-31T00:00:00.000Z'),
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
    ownerId = owner.creators!.id;
    contractId = owner.creators!.contracts[0].id;
    userIds.push(owner.id);

    const stranger = await prisma.users.create({
      data: {
        email: `${MARKER}-stranger@example.test`,
        creators: {
          create: {
            first_name: 'Other',
            last_name: 'Creator',
          },
        },
      },
      include: { creators: true },
    });
    strangerId = stranger.creators!.id;
    userIds.push(stranger.id);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (userIds.length > 0) {
      await prisma.creators.deleteMany({
        where: { user_id: { in: userIds } },
      });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  beforeEach(() => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('DEV_CREATOR_ID', '');
  });

  it('persists the owner Creator Comment with the profile name and returns it in timeline history', async () => {
    const content = await createContent('owner comment');

    const response = await postComment(content.id, { comment: COMMENT });

    expect(response.status).toBe(201);
    const events = await history.getForContent(content.id);
    expect(events).toContainEqual(
      expect.objectContaining({
        content_id: content.id,
        event_type: 'Creator Comment',
        actor_name: PROFILE_NAME,
        actor_role: 'creator',
        occurred_at: expect.any(Date),
        event_data: { comment: COMMENT },
      }),
    );
  });

  it('answers 401 without a Creator identity and persists no comment', async () => {
    const content = await createContent('anonymous comment');

    const response = await postComment(content.id, { comment: COMMENT }, null);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Silakan masuk terlebih dahulu',
    });
    expect(await history.getForContent(content.id)).toEqual([]);
  });

  it('answers 404 when another Creator does not own the content and persists no comment', async () => {
    const content = await createContent('non-owner comment');

    const response = await postComment(content.id, { comment: COMMENT }, strangerId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'CONTENT_NOT_FOUND',
      message: 'Konten tidak ditemukan',
    });
    expect(await history.getForContent(content.id)).toEqual([]);
  });

  it('answers 422 for a blank comment and persists no event', async () => {
    const content = await createContent('invalid comment');

    const response = await postComment(content.id, { comment: '   ' });

    expect(response.status).toBe(422);
    expect(await history.getForContent(content.id)).toEqual([]);
  });

  it('answers 400 for a malformed content ID before recording a comment', async () => {
    const response = await postComment('not-a-uuid', { comment: COMMENT });

    expect(response.status).toBe(400);
  });
});
