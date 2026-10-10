import {
  ConflictException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../auth/admin.guard.js';
import { ProposalReviewController } from './proposal-review.controller.js';
import { ProposalReviewService } from './proposal-review.service.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ADMIN = '33333333-3333-4333-8333-333333333333';

describe('ProposalReviewController', () => {
  const service = { approve: vi.fn(), reject: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProposalReviewController],
      providers: [{ provide: ProposalReviewService, useValue: service }],
    })
      // The guard's own contract (session, admin role, same origin) is tested at the guard.
      .overrideGuard(AdminGuard)
      .useValue({
        // As the real guard does, the stand-in names the signed-in admin on the request.
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().principal = { userId: ADMIN, role: 'admin' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.approve.mockReset();
    service.reject.mockReset();
  });

  it('is open to signed-in admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ProposalReviewController)).toEqual([
      AdminGuard,
    ]);
  });

  it('approves through PATCH /contents/:id/proposal/approve', async () => {
    service.approve.mockResolvedValue({ id: ID, status: 'scheduled' });

    const { body } = await request(app.getHttpServer())
      .patch(`/contents/${ID}/proposal/approve`)
      .expect(200);

    expect(body).toEqual({ id: ID, status: 'scheduled' });
    expect(service.approve).toHaveBeenCalledWith(ID, ADMIN);
  });

  it('rejects through POST /contents/:id/proposal/reject with the checked reason, answering 200', async () => {
    service.reject.mockResolvedValue({ id: ID, removed: true });

    const { body } = await request(app.getHttpServer())
      .post(`/contents/${ID}/proposal/reject`)
      .send({ reason: '  Kurang relevan.  ' })
      .expect(200);

    expect(body).toEqual({ id: ID, removed: true });
    expect(service.reject).toHaveBeenCalledWith(ID, { reason: 'Kurang relevan.' });
  });

  it('rejects with no body at all, since the reason is optional', async () => {
    service.reject.mockResolvedValue({ id: ID, removed: true });

    await request(app.getHttpServer()).post(`/contents/${ID}/proposal/reject`).expect(200);

    expect(service.reject).toHaveBeenCalledWith(ID, { reason: null });
  });

  it('answers 422 for a reason that is not text, before the service is asked', async () => {
    const { body } = await request(app.getHttpServer())
      .post(`/contents/${ID}/proposal/reject`)
      .send({ reason: 42 })
      .expect(422);

    expect(body.errors).toEqual({ reason: 'Alasan harus berupa teks' });
    expect(service.reject).not.toHaveBeenCalled();
  });

  it.each([
    ['patch', 'approve'],
    ['post', 'reject'],
  ] as const)('answers 400 for a malformed id on %s %s, before the service is asked', async (method, action) => {
    await request(app.getHttpServer())[method](`/contents/not-a-uuid/proposal/${action}`).expect(400);

    expect(service.approve).not.toHaveBeenCalled();
    expect(service.reject).not.toHaveBeenCalled();
  });

  it("passes the service's 409 through unchanged", async () => {
    service.approve.mockRejectedValue(
      new ConflictException({
        code: 'PROPOSAL_NOT_PENDING',
        message: 'Pengajuan ini sudah tidak menunggu keputusan',
      }),
    );

    const { body } = await request(app.getHttpServer())
      .patch(`/contents/${ID}/proposal/approve`)
      .expect(409);

    expect(body).toEqual({
      code: 'PROPOSAL_NOT_PENDING',
      message: 'Pengajuan ini sudah tidak menunggu keputusan',
    });
  });
});
