import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../../auth/admin.guard.js';
import { PerformanceLinksSyncController } from './performance-links-sync.controller.js';
import { PerformanceSyncService } from './performance-sync.service.js';

const LINK_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const LINK_B = '6a1d0c9e-2b3f-4a5d-8e7f-9c0b1a2d3e4f';

describe('POST /performance/links/sync (the page\'s "Sinkronkan Sekarang", SCRUM-285)', () => {
  const sync = { syncLinks: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PerformanceLinksSyncController],
      providers: [{ provide: PerformanceSyncService, useValue: sync }],
    })
      // AdminGuard has its own spec; here it lets the request through.
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens to signed-in admins only, same-origin checked by AdminGuard (OWASP A01)', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PerformanceLinksSyncController),
    ).toEqual([AdminGuard]);
  });

  it("syncs the page's links and answers how many were updated with 200", async () => {
    sync.syncLinks.mockResolvedValue({
      updated: 1,
      notUpdated: 0,
      busy: 1,
      locked: 2,
    });

    const response = await request(app.getHttpServer())
      .post('/performance/links/sync')
      .send({ linkIds: [LINK_A, LINK_B] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      updated: 1,
      notUpdated: 0,
      busy: 1,
      locked: 2,
    });
    expect(sync.syncLinks).toHaveBeenCalledWith([LINK_A, LINK_B]);
  });

  it('refuses ids that are not uuids before any read (OWASP A05)', async () => {
    const response = await request(app.getHttpServer())
      .post('/performance/links/sync')
      .send({ linkIds: ['not-a-uuid'] });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'INVALID_LINK_IDS' });
    expect(sync.syncLinks).not.toHaveBeenCalled();
  });
});
