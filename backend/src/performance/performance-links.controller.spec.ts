import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../auth/admin.guard.js';
import { PerformanceLinksController } from './performance-links.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';

const RANGGA = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const PAGE = { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 };

describe('PerformanceLinksController (GET /performance/links)', () => {
  const links = { list: vi.fn() };
  let app: INestApplication;
  let allow = true;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PerformanceLinksController],
      providers: [{ provide: PerformanceLinksService, useValue: links }],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: (_context: ExecutionContext) => allow })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    allow = true;
    links.list.mockReset().mockResolvedValue(PAGE);
  });

  const get = (query = '') =>
    request(app.getHttpServer()).get(`/performance/links${query}`);

  it('is guarded for admins only, on the whole controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PerformanceLinksController),
    ).toEqual([AdminGuard]);
  });

  it('answers the first page of ten with no filter when none is asked for', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PAGE);
    expect(links.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      { creators: undefined, platforms: undefined },
    );
  });

  it('passes the page and the repeated creator and platform filters on, checked', async () => {
    await get(
      `?page=3&pageSize=20&creator=${RANGGA}&platform=instagram&platform=tiktok`,
    );

    expect(links.list).toHaveBeenCalledWith(
      { page: 3, pageSize: 20 },
      { creators: [RANGGA], platforms: ['instagram', 'tiktok'] },
    );
  });

  it.each([
    ['page 0', '?page=0'],
    ['a page that is not a number', '?page=two'],
    ['a page size over 50', '?pageSize=51'],
    ['a creator that is not an id', '?creator=rangga'],
    ['an unknown platform', '?platform=youtube'],
  ])('answers 400 for %s without reading anything', async (_case, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    expect(links.list).not.toHaveBeenCalled();
  });

  it('reads nothing for a request the guard turns away', async () => {
    allow = false;

    expect((await get()).status).toBe(403);
    expect(links.list).not.toHaveBeenCalled();
  });
});
