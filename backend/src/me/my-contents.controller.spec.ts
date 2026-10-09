import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DEV_CREATOR_HEADER } from '../auth/dev-creator.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContentDetailService } from '../contents/content-detail.service.js';
import { MyContentsController } from './my-contents.controller.js';
import { MyContentsService } from './my-contents.service.js';

const CREATOR_ID = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const CONTENT_ID = '11111111-1111-1111-1111-111111111111';
const EMPTY = { items: [], page: 1, pageSize: 5, total: 0, totalPages: 1 };
const DETAIL = {
  id: CONTENT_ID,
  name: 'Evg_Test 1',
  type: 'evergreen',
  brief: '',
  deadline: '2026-09-30',
  status: 'scheduled',
  creatorName: 'Rangga Pratama',
  tags: { overdue: false, lateSubmission: false, approvalBypassed: false },
  waitingOn: 'creator',
  latestSubmissionId: null,
  creatorActions: ['submit_draft'],
  events: [],
};

describe('MyContentsController', () => {
  const contents = { list: vi.fn() };
  const detail = { getDetail: vi.fn() };
  const prisma = { creators: { findUnique: vi.fn() } };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyContentsController],
      providers: [
        { provide: MyContentsService, useValue: contents },
        { provide: ContentDetailService, useValue: detail },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    contents.list.mockReset().mockResolvedValue(EMPTY);
    detail.getDetail.mockReset().mockResolvedValue(DETAIL);
    prisma.creators.findUnique
      .mockReset()
      .mockResolvedValue({ id: CREATOR_ID });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function get(query = '') {
    return request(app.getHttpServer())
      .get(`/me/contents${query}`)
      .set(DEV_CREATOR_HEADER, CREATOR_ID);
  }

  it("lists the calling creator's contents, first page of 5 by default", async () => {
    const before = Date.now();

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(EMPTY);
    const [creatorId, paging, now] = contents.list.mock.calls[0];
    expect(creatorId).toBe(CREATOR_ID);
    expect(paging).toEqual({ page: 1, pageSize: 5 });
    expect((now as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('passes the requested page and page size through', async () => {
    await get('?page=2&pageSize=10');

    expect(contents.list).toHaveBeenCalledWith(
      CREATOR_ID,
      { page: 2, pageSize: 10 },
      expect.any(Date),
    );
  });

  it('passes a status filter through with the page', async () => {
    await get('?status=draft_review&page=2');

    expect(contents.list).toHaveBeenCalledWith(
      CREATOR_ID,
      { page: 2, pageSize: 5, status: 'draft_review' },
      expect.any(Date),
    );
  });

  it.each([
    ['a non-numeric page', '?page=abc'],
    ['an unknown status', '?status=done'],
    ['a repeated status', '?status=scheduled&status=draft_review'],
    ['page 0', '?page=0'],
    ['a SQL payload as page size', '?pageSize=5;DROP TABLE contents'],
    ['a page size above the cap', '?pageSize=51'],
  ])('answers 400 for %s before reading anything', async (_label, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    expect(contents.list).not.toHaveBeenCalled();
  });

  it('answers 401 without listing anything when no creator is identified', async () => {
    const response = await request(app.getHttpServer()).get('/me/contents');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(contents.list).not.toHaveBeenCalled();
  });

  it('answers 401 in production even with dev auth switched on', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await get();

    expect(response.status).toBe(401);
    expect(contents.list).not.toHaveBeenCalled();
  });

  it("answers GET /me/contents/:id with the detail, scoped to the calling creator", async () => {
    const before = Date.now();

    const response = await request(app.getHttpServer())
      .get(`/me/contents/${CONTENT_ID}`)
      .set(DEV_CREATOR_HEADER, CREATOR_ID);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(DETAIL);
    const [id, now, options] = detail.getDetail.mock.calls[0];
    expect(id).toBe(CONTENT_ID);
    expect((now as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(options).toEqual({ creatorId: CREATOR_ID });
  });

  it('answers 400 for a malformed content id before the detail service is touched', async () => {
    const response = await request(app.getHttpServer())
      .get('/me/contents/not-a-uuid')
      .set(DEV_CREATOR_HEADER, CREATOR_ID);

    expect(response.status).toBe(400);
    expect(detail.getDetail).not.toHaveBeenCalled();
  });

  it('answers 401 for the detail without reading anything when no creator is identified', async () => {
    const response = await request(app.getHttpServer()).get(
      `/me/contents/${CONTENT_ID}`,
    );

    expect(response.status).toBe(401);
    expect(detail.getDetail).not.toHaveBeenCalled();
  });
});
