import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { AuditLogsController } from './audit-logs.controller.js';
import { AuditLogsService } from './audit-logs.service.js';

const EMPTY_LIST = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};
const OPTIONS = {
  actors: [{ value: 'system', label: 'Sistem' }],
  creators: [],
};

describe('AuditLogsController (SCRUM-296)', () => {
  // PBI-23: Log Aktivitas is for Super Admins only, both the list and who it can be filtered by
  // (OWASP A01:2025). The guard itself is proven in super-admin.guard.spec.ts and end to end.
  it('is open to Super Admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AuditLogsController)).toEqual([
      SuperAdminGuard,
    ]);
  });

  describe('over HTTP', () => {
    const service = { list: vi.fn(), filterOptions: vi.fn() };
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [AuditLogsController],
        providers: [{ provide: AuditLogsService, useValue: service }],
      })
        .overrideGuard(SuperAdminGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = moduleRef.createNestApplication({ logger: false });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      vi.resetAllMocks();
      service.list.mockResolvedValue(EMPTY_LIST);
      service.filterOptions.mockResolvedValue(OPTIONS);
    });

    const get = (url: string) => request(app.getHttpServer()).get(url);

    it('answers the list for the checked page and filters', async () => {
      const response = await get(
        '/audit-logs?page=2&category=pengaturan&pageSize=1000',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(EMPTY_LIST);
      const [{ page, filter }] = service.list.mock.calls[0];
      expect(page).toBe(2);
      expect(filter.toWhere()).toEqual({
        AND: [{ category: { in: ['pengaturan'] } }],
      });
    });

    it('reads a missing page as the first', async () => {
      await get('/audit-logs');

      expect(service.list.mock.calls[0][0].page).toBe(1);
    });

    it('answers the filter options', async () => {
      const response = await get('/audit-logs/filter-options');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(OPTIONS);
    });

    // Who did what to whose money must not stay in a browser or proxy cache (OWASP A02:2025).
    it.each(['/audit-logs', '/audit-logs/filter-options'])(
      'tells every cache not to keep %s',
      async (url) => {
        const response = await get(url);

        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    // Nothing that fails the checks reaches the database (OWASP A05:2025, A10:2025).
    it.each([
      ['a page that is not a number', '/audit-logs?page=abc'],
      ['a page below 1', '/audit-logs?page=0'],
      ['an unknown category', '/audit-logs?category=semua'],
      ['an injected actor', "/audit-logs?actor=x'%20OR%20'1'%3D'1"],
      ['a reversed date range', '/audit-logs?from=2026-11-03&to=2026-11-01'],
    ])('answers 400 to %s without reading the log', async (_name, url) => {
      const response = await get(url);

      expect(response.status).toBe(400);
      expect(service.list).not.toHaveBeenCalled();
    });

    // The log can only be read here; AuditLogger is the only writer (OWASP A06:2025, A09:2025).
    it.each(['post', 'put', 'patch', 'delete'] as const)(
      'has no %s route',
      async (method) => {
        const response = await request(app.getHttpServer())[method](
          '/audit-logs',
        );

        expect(response.status).toBe(404);
      },
    );

    // A database failure answers a plain 500 that names no table, query or driver (OWASP A10:2025).
    it('answers a failure to read the log without its details', async () => {
      service.list.mockRejectedValue(
        new Error(
          'Invalid `prisma.audit_logs.findMany()` invocation: relation "audit_logs" does not exist',
        ),
      );

      const response = await get('/audit-logs');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    });
  });
});
