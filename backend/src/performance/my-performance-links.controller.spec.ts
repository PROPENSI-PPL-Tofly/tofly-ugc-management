import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { MyPerformanceLinksController } from './my-performance-links.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';

const SIGNED_IN = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const SOMEONE_ELSE = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const PAGE = { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 };

// DevCreatorGuard is proven on its own; here a test header says which creator it resolved.
const AS = 'x-test-creator';

function stubGuard(context: ExecutionContext): boolean {
  const req = context
    .switchToHttp()
    .getRequest<{ headers: Record<string, string>; creatorId?: string }>();
  req.creatorId = req.headers[AS];
  return true;
}

describe('MyPerformanceLinksController (GET /me/performance/links, PBI-27 AC 20)', () => {
  const links = { list: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyPerformanceLinksController],
      providers: [{ provide: PerformanceLinksService, useValue: links }],
    })
      .overrideGuard(DevCreatorGuard)
      .useValue({ canActivate: stubGuard })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    links.list.mockReset().mockResolvedValue(PAGE);
  });

  const get = (query = '') =>
    request(app.getHttpServer())
      .get(`/me/performance/links${query}`)
      .set(AS, SIGNED_IN);

  it("is guarded by the creator's own session, on the whole controller", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MyPerformanceLinksController),
    ).toEqual([DevCreatorGuard]);
  });

  it("lists only the signed-in creator's links, ten a page, in the admin list's envelope", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PAGE);
    expect(links.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      { creators: [SIGNED_IN], platforms: undefined },
    );
  });

  it('never reads a creator the address names: only the session decides whose links (OWASP A01:2025)', async () => {
    await get(`?creator=${SOMEONE_ELSE}&creator=${SIGNED_IN}`);

    expect(links.list).toHaveBeenCalledWith(expect.anything(), {
      creators: [SIGNED_IN],
      platforms: undefined,
    });
  });

  it('passes the page and the checked platform filter on', async () => {
    await get('?page=2&pageSize=10&platform=tiktok');

    expect(links.list).toHaveBeenCalledWith(
      { page: 2, pageSize: 10 },
      { creators: [SIGNED_IN], platforms: ['tiktok'] },
    );
  });

  it.each([
    ['page 0', '?page=0'],
    ['a page size over 50', '?pageSize=51'],
    ['an unknown platform', '?platform=youtube'],
  ])('answers 400 for %s without reading anything', async (_case, query) => {
    expect((await get(query)).status).toBe(400);
    expect(links.list).not.toHaveBeenCalled();
  });

  it('answers 401 when the guard resolved no creator', async () => {
    const response = await request(app.getHttpServer()).get(
      '/me/performance/links',
    );

    expect(response.status).toBe(401);
    expect(links.list).not.toHaveBeenCalled();
  });
});
