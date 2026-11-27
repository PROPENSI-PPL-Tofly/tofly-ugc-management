import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DEV_CREATOR_HEADER, DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MyProposalsController } from './my-proposals.controller.js';
import { MyProposalsService } from './my-proposals.service.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const CONTENT = '33333333-3333-4333-8333-333333333333';

const BODY = {
  name: '  Unboxing Paket Besar ',
  brief: 'Tunjukkan proses kirim paket besar.',
  deadline: '2026-12-20',
  notes: 'Pakai produk di rumah.',
};

describe('MyProposalsController', () => {
  it('is open to the signed-in creator only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MyProposalsController)).toEqual([DevCreatorGuard]);
  });

  const proposals = { create: vi.fn(), cancel: vi.fn() };
  const prisma = { creators: { findUnique: vi.fn() } };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyProposalsController],
      providers: [
        { provide: MyProposalsService, useValue: proposals },
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const server = () => request(app.getHttpServer());

  // OWASP Top 10:2025 A01: whose proposal it is comes from the creator the guard resolved, never
  // from the body or the URL.
  describe('POST /me/contents/proposals', () => {
    it("saves the checked proposal for the signed-in creator and answers 201", async () => {
      proposals.create.mockResolvedValue({ id: CONTENT, status: 'pending' });

      const res = await server()
        .post('/me/contents/proposals')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .send({ ...BODY, creatorId: 'someone-else', contractId: 'another', status: 'scheduled' })
        .expect(201);

      expect(res.body).toEqual({ id: CONTENT, status: 'pending' });
      expect(proposals.create).toHaveBeenCalledWith(CREATOR, {
        name: 'Unboxing Paket Besar',
        brief: 'Tunjukkan proses kirim paket besar.',
        deadline: '2026-12-20',
        notes: 'Pakai produk di rumah.',
      });
    });

    it('answers the per-field 422 for a form that is not valid, before the service is reached', async () => {
      const res = await server()
        .post('/me/contents/proposals')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .send({ name: '', brief: 'x', deadline: 'soon' })
        .expect(422);

      expect(res.body).toMatchObject({
        message: 'Data pengajuan tidak valid',
        errors: { name: 'Nama konten wajib diisi', deadline: 'Format deadline tidak valid' },
      });
      expect(proposals.create).not.toHaveBeenCalled();
    });

    it('answers 401 without a creator', async () => {
      await server().post('/me/contents/proposals').send(BODY).expect(401);

      expect(proposals.create).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /me/contents/proposals/:id', () => {
    it('withdraws the signed-in creator’s proposal', async () => {
      proposals.cancel.mockResolvedValue({ id: CONTENT, removed: true });

      const res = await server()
        .delete(`/me/contents/proposals/${CONTENT}`)
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(200);

      expect(res.body).toEqual({ id: CONTENT, removed: true });
      expect(proposals.cancel).toHaveBeenCalledWith(CREATOR, CONTENT);
    });

    it('answers 401 without a creator', async () => {
      await server().delete(`/me/contents/proposals/${CONTENT}`).expect(401);

      expect(proposals.cancel).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A05 (Injection): only a UUID reaches the query.
    it('answers 400 for an id that is not a UUID, before any query', async () => {
      await server()
        .delete('/me/contents/proposals/not-a-uuid')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(400);

      expect(proposals.cancel).not.toHaveBeenCalled();
    });
  });
});
