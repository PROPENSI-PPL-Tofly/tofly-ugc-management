import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DEV_CREATOR_HEADER,
  DevCreatorGuard,
} from '../auth/dev-creator.guard.js';
import { InvoiceCommentsService } from '../invoices/invoice-comments.service.js';
import { PaymentProofService } from '../invoices/payment-proof.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MyInvoicePaymentsController } from './my-invoice-payments.controller.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const CONTRACT = '11111111-1111-4111-8111-111111111111';
const COMMENT = {
  id: 'c1',
  authorName: 'Rangga Pratama',
  authorRole: 'creator',
  text: 'Halo kak',
  createdAt: '2026-10-20T03:00:00.000Z',
};

describe('MyInvoicePaymentsController', () => {
  it('is open to the signed-in creator only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MyInvoicePaymentsController),
    ).toEqual([DevCreatorGuard]);
  });

  const proofs = { open: vi.fn() };
  const comments = { list: vi.fn(), add: vi.fn() };
  const prisma = { creators: { findUnique: vi.fn() } };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyInvoicePaymentsController],
      providers: [
        { provide: PaymentProofService, useValue: proofs },
        { provide: InvoiceCommentsService, useValue: comments },
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

  // OWASP Top 10:2025 A01 (Broken Access Control): every call is scoped by the creator the guard
  // resolved, never by anything the URL or the body says about who is asking.
  describe('accepts', () => {
    it("lists the thread of one of the creator's own contracts", async () => {
      comments.list.mockResolvedValue([COMMENT]);

      const res = await server()
        .get(`/me/invoices/${CONTRACT}/comments`)
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(200);

      expect(res.body).toEqual([COMMENT]);
      expect(comments.list).toHaveBeenCalledWith(CONTRACT, {
        creatorId: CREATOR,
      });
    });

    it('adds a comment as the creator, trimmed', async () => {
      comments.add.mockResolvedValue(COMMENT);

      const res = await server()
        .post(`/me/invoices/${CONTRACT}/comments`)
        .set(DEV_CREATOR_HEADER, CREATOR)
        .send({ text: ' Halo kak ' })
        .expect(201);

      expect(res.body).toEqual(COMMENT);
      expect(comments.add).toHaveBeenCalledWith(
        CONTRACT,
        { text: 'Halo kak' },
        { role: 'creator', creatorId: CREATOR },
      );
    });

    it("opens the proof of one of the creator's own contracts", async () => {
      proofs.open.mockResolvedValue({
        kind: 'redirect',
        url: 'https://signed',
      });

      const res = await server()
        .get(`/me/invoices/${CONTRACT}/payment-proof`)
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(302);

      expect(res.headers.location).toBe('https://signed');
      expect(proofs.open).toHaveBeenCalledWith(CONTRACT, {
        creatorId: CREATOR,
      });
    });
  });

  describe('refuses', () => {
    it.each([
      ['GET', 'comments'],
      ['POST', 'comments'],
      ['GET', 'payment-proof'],
    ])('%s %s without a creator', async (method, path) => {
      const call =
        method === 'GET'
          ? server().get(`/me/invoices/${CONTRACT}/${path}`)
          : server()
              .post(`/me/invoices/${CONTRACT}/${path}`)
              .send({ text: 'x' });

      await call.expect(401);
      expect(comments.list).not.toHaveBeenCalled();
      expect(comments.add).not.toHaveBeenCalled();
      expect(proofs.open).not.toHaveBeenCalled();
    });

    it('a comment that sends its own author, writing nothing', async () => {
      const res = await server()
        .post(`/me/invoices/${CONTRACT}/comments`)
        .set(DEV_CREATOR_HEADER, CREATOR)
        .send({ text: 'Halo', authorRole: 'admin' })
        .expect(422);

      expect(res.body).toEqual({
        code: 'COMMENT_INVALID',
        message: 'Data komentar tidak valid',
      });
      expect(comments.add).not.toHaveBeenCalled();
    });

    it.each(['comments', 'payment-proof'])(
      'a contract id that is not a UUID on %s',
      async (path) => {
        await server()
          .get(`/me/invoices/not-a-uuid/${path}`)
          .set(DEV_CREATOR_HEADER, CREATOR)
          .expect(400);
      },
    );
  });
});
