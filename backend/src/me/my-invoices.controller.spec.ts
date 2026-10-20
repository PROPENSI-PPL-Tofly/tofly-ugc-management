import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DEV_CREATOR_HEADER,
  DevCreatorGuard,
} from '../auth/dev-creator.guard.js';
import { InvoiceConfirmationService } from '../invoices/invoice-confirmation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MyInvoicesController } from './my-invoices.controller.js';
import { MyInvoicesService } from './my-invoices.service.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const CONTRACT = '11111111-1111-4111-8111-111111111111';

describe('MyInvoicesController', () => {
  it('is open to the signed-in creator only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MyInvoicesController)).toEqual([
      DevCreatorGuard,
    ]);
  });

  const invoices = { list: vi.fn() };
  const confirmations = { acknowledge: vi.fn(), confirmReceipt: vi.fn() };
  const prisma = { creators: { findUnique: vi.fn() } };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MyInvoicesController],
      providers: [
        { provide: MyInvoicesService, useValue: invoices },
        { provide: InvoiceConfirmationService, useValue: confirmations },
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

  // OWASP Top 10:2025 A01 (Broken Access Control): whose invoices, and who moves one, comes from
  // the creator the guard resolved, never from the URL or the body.
  describe('accepts', () => {
    it("lists the signed-in creator's invoices as of now", async () => {
      const answer = { items: [{ contract: { id: CONTRACT } }] };
      invoices.list.mockResolvedValue(answer);
      const before = Date.now();

      const res = await server()
        .get('/me/invoices')
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(200);

      expect(res.body).toEqual(answer);
      expect(invoices.list).toHaveBeenCalledExactlyOnceWith(
        CREATOR,
        expect.any(Date),
      );
      const asOf = invoices.list.mock.calls[0][1] as Date;
      expect(asOf.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('acknowledges one invoice as the signed-in creator', async () => {
      const answer = {
        invoiceStatus: 'creator_acked',
        acknowledgedAt: '2026-10-20T03:00:00.000Z',
      };
      confirmations.acknowledge.mockResolvedValue(answer);

      const res = await server()
        .post(`/me/invoices/${CONTRACT}/acknowledge`)
        .set(DEV_CREATOR_HEADER, CREATOR)
        .send({ creatorId: 'someone-else', status: 'paid' })
        .expect(201);

      expect(res.body).toEqual(answer);
      expect(confirmations.acknowledge).toHaveBeenCalledExactlyOnceWith(
        CONTRACT,
        CREATOR,
      );
    });

    it('confirms receipt of one invoice as the signed-in creator', async () => {
      const answer = {
        invoiceStatus: 'paid',
        paidAt: '2026-10-20T03:00:00.000Z',
      };
      confirmations.confirmReceipt.mockResolvedValue(answer);

      const res = await server()
        .post(`/me/invoices/${CONTRACT}/confirm-receipt`)
        .set(DEV_CREATOR_HEADER, CREATOR)
        .expect(201);

      expect(res.body).toEqual(answer);
      expect(confirmations.confirmReceipt).toHaveBeenCalledExactlyOnceWith(
        CONTRACT,
        CREATOR,
      );
    });
  });

  describe('refuses', () => {
    it.each([
      ['get', '/me/invoices'],
      ['post', `/me/invoices/${CONTRACT}/acknowledge`],
      ['post', `/me/invoices/${CONTRACT}/confirm-receipt`],
    ] as const)('%s %s without a creator', async (method, path) => {
      await server()[method](path).expect(401);

      expect(invoices.list).not.toHaveBeenCalled();
      expect(confirmations.acknowledge).not.toHaveBeenCalled();
      expect(confirmations.confirmReceipt).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A05 (Injection): only a UUID reaches the query.
    it.each(['acknowledge', 'confirm-receipt'])(
      'a contract id that is not a UUID on %s, before any query',
      async (move) => {
        await server()
          .post(`/me/invoices/not-a-uuid/${move}`)
          .set(DEV_CREATOR_HEADER, CREATOR)
          .expect(400);

        expect(confirmations.acknowledge).not.toHaveBeenCalled();
        expect(confirmations.confirmReceipt).not.toHaveBeenCalled();
      },
    );
  });
});
