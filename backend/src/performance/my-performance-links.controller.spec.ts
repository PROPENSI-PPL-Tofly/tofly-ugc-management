import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DEV_CREATOR_HEADER,
  DevCreatorGuard,
} from '../auth/dev-creator.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MyPerformanceLinksController } from './my-performance-links.controller.js';
import { PerformanceLinksService } from './performance-links.service.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const OTHER_CREATOR = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';

describe('MyPerformanceLinksController (PBI-27 AC 20)', () => {
  it('is open to the signed-in creator only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MyPerformanceLinksController),
    ).toEqual([DevCreatorGuard]);
  });

  const links = { list: vi.fn() };
  const prisma = { creators: { findUnique: vi.fn() } };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyPerformanceLinksController],
      providers: [
        { provide: PerformanceLinksService, useValue: links },
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
    vi.resetAllMocks();
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    prisma.creators.findUnique.mockResolvedValue({ id: CREATOR });
    links.list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function get(query = '') {
    return request(app.getHttpServer())
      .get(`/me/performance/links${query}`)
      .set(DEV_CREATOR_HEADER, CREATOR);
  }

  it("lists the signed-in creator's own links, 10 a page, in the admin list's shape", async () => {
    const page = {
      items: [{ linkId: 'l-1', platform: 'tiktok', views: 12400 }],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    };
    links.list.mockResolvedValue(page);

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(page);
    expect(links.list).toHaveBeenCalledExactlyOnceWith(
      { page: 1, pageSize: 10 },
      { creators: [CREATOR] },
    );
  });

  it('passes the page and the checked platforms on', async () => {
    await get('?page=2&platform=instagram&platform=tiktok');

    expect(links.list).toHaveBeenCalledExactlyOnceWith(
      { page: 2, pageSize: 10 },
      { creators: [CREATOR], platforms: ['instagram', 'tiktok'] },
    );
  });

  it('passes the checked data states on', async () => {
    await get('?state=synced&state=manual');

    expect(links.list).toHaveBeenCalledExactlyOnceWith(
      { page: 1, pageSize: 10 },
      { creators: [CREATOR], states: ['synced', 'manual'] },
    );
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): whose links is the creator the guard
  // resolved; a creator named in the address is never read, so no address reaches another
  // creator's numbers.
  it('ignores a creator named in the address', async () => {
    await get(`?creator=${OTHER_CREATOR}`);

    expect(links.list).toHaveBeenCalledExactlyOnceWith(
      { page: 1, pageSize: 10 },
      { creators: [CREATOR] },
    );
  });

  it.each(['?pageSize=50', '?pageSize=51', '?pageSize=x'])(
    'keeps the Performa page at 10 rows whatever %s asks',
    async (query) => {
      const response = await get(query);

      expect(response.status).toBe(200);
      expect(links.list).toHaveBeenCalledExactlyOnceWith(
        { page: 1, pageSize: 10 },
        { creators: [CREATOR] },
      );
    },
  );

  it.each(['?page=0', '?page=x', '?platform=youtube', '?state=done'])(
    'answers 400 for %s before reading anything',
    async (query) => {
      expect((await get(query)).status).toBe(400);
      expect(links.list).not.toHaveBeenCalled();
    },
  );

  it('answers 401 without a creator', async () => {
    const response = await request(app.getHttpServer()).get(
      '/me/performance/links',
    );

    expect(response.status).toBe(401);
    expect(links.list).not.toHaveBeenCalled();
  });
});
