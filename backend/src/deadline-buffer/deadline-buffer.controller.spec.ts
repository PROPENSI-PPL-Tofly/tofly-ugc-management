import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { DeadlineBufferController } from './deadline-buffer.controller.js';
import { DeadlineBufferService } from './deadline-buffer.service.js';

const SUPER_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const VIEW = { bufferDays: 7, min: 1, max: 14 };

describe('DeadlineBufferController (SCRUM-298)', () => {
  // OWASP A01:2025: every signed-in form may read the buffer; only a Super Admin may change it.
  describe('access', () => {
    const guardsOf = (handler: keyof DeadlineBufferController) =>
      Reflect.getMetadata(
        GUARDS_METADATA,
        DeadlineBufferController.prototype[handler],
      );

    it('lets every creator and Admin read the buffer', () => {
      expect(guardsOf('read')).toEqual([CreatorOrAdminGuard]);
    });

    it('lets only a Super Admin change it', () => {
      expect(guardsOf('replace')).toEqual([SuperAdminGuard]);
    });

    it('puts no guard on the controller that would block a reader', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, DeadlineBufferController),
      ).toBeUndefined();
    });
  });

  describe('over HTTP', () => {
    const service = { view: vi.fn(), replace: vi.fn() };
    let principal: { userId: string; role: 'admin' } | undefined;
    let app: INestApplication;

    const signedIn = {
      canActivate: (context: ExecutionContext) => {
        context.switchToHttp().getRequest().principal = principal;
        return true;
      },
    };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [DeadlineBufferController],
        providers: [{ provide: DeadlineBufferService, useValue: service }],
      })
        .overrideGuard(CreatorOrAdminGuard)
        .useValue(signedIn)
        .overrideGuard(SuperAdminGuard)
        .useValue(signedIn)
        .compile();
      app = moduleRef.createNestApplication({ logger: false });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      vi.resetAllMocks();
      principal = { userId: SUPER_ADMIN, role: 'admin' };
      service.view.mockResolvedValue(VIEW);
      service.replace.mockResolvedValue({ ...VIEW, bufferDays: 5 });
    });

    const server = () => request(app.getHttpServer());

    it('answers the buffer and its range', async () => {
      const response = await server().get('/deadline-buffer');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(VIEW);
    });

    it('saves a checked buffer as the signed-in Super Admin', async () => {
      const response = await server()
        .put('/deadline-buffer')
        .send({ bufferDays: 5 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...VIEW, bufferDays: 5 });
      expect(service.replace).toHaveBeenCalledWith(5, SUPER_ADMIN);
    });

    it('saves as no one behind the local development stand-in', async () => {
      principal = undefined;

      await server().put('/deadline-buffer').send({ bufferDays: 5 });

      expect(service.replace).toHaveBeenCalledWith(5, undefined);
    });

    // A form must never validate with a buffer a cache kept from before a save (OWASP A02:2025).
    it.each([
      ['reading', () => server().get('/deadline-buffer')],
      [
        'saving',
        () => server().put('/deadline-buffer').send({ bufferDays: 5 }),
      ],
    ])('tells every cache not to keep the buffer when %s', async (_n, call) => {
      expect((await call()).headers['cache-control']).toBe('no-store');
    });

    // OWASP A05:2025: nothing that fails the check reaches the service.
    it.each([
      { bufferDays: '5' },
      { bufferDays: 15 },
      { bufferDays: 5, id: false },
    ])('answers 422 to %j without saving', async (body) => {
      const response = await server().put('/deadline-buffer').send(body);

      expect(response.status).toBe(422);
      expect(service.replace).not.toHaveBeenCalled();
    });

    // OWASP A10:2025: a failure answers a plain 500 that names no table or query.
    it('answers a failure to read the buffer without its details', async () => {
      service.view.mockRejectedValue(
        new Error('deadline_buffer holds 0, outside 1-14'),
      );

      const response = await server().get('/deadline-buffer');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    });
  });
});
