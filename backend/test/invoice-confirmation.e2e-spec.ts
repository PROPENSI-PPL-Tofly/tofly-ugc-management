import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { jakartaMidnight } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RateFormulaService } from '../src/rate-formula/rate-formula.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// SCRUM-164 (13.1): the invoice walks Finalized → Acknowledged → Payment Proof Uploaded → Paid,
// the creator makes the first and the last move on their own invoice only, and every move keeps
// who made it and when.

const MARKER = 'e2e-invoice-confirmation';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const FORMULA = {
  latePenaltyPerDay: 50_000,
  maxPenaltyDays: 3,
  specificBonus: 100_000,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [{ threshold: 10_000, bonus: 150_000 }],
    },
    tiktok: {
      metric: 'views',
      tiers: [{ threshold: 10_000, bonus: 150_000 }],
    },
  },
} as const;

/** A calendar day relative to today in Jakarta. */
function day(offset: number): Date {
  const today = jakartaMidnight(new Date());
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + offset,
    ),
  );
}

interface Contract {
  start: number;
  end: number;
}

interface ListedInvoice {
  contract: { id: string; period: number };
  invoiceStatus: string;
  acknowledgedAt: string | null;
  paidAt: string | null;
}

describe('Invoice status flow and creator confirmation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: string;
  let savedFormula: Awaited<ReturnType<RateFormulaService['read']>>;
  let admin: ReturnType<typeof as>;
  let adminId: string;

  let nadia: ReturnType<typeof as>;
  let nadiaCookie: string;
  let nadiaUser: string;
  let nadiaCreator: string;
  /** Nadia's first contract, ended: the invoice the whole flow walks. */
  let nadiaEarlier: string;
  /** Nadia's second contract, still running. */
  let nadiaCurrent: string;

  let kevin: ReturnType<typeof as>;
  let kevinContract: string;
  let sariContract: string;

  /** Creates a creator under the marker with the given contracts, and signs them in. */
  async function creator(name: string, contracts: Contract[]) {
    const user = await prisma.users.create({
      data: { email: `${MARKER}-${name.toLowerCase()}@example.com` },
    });
    const made = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} ${name}`,
        contracts: {
          create: contracts.map(({ start, end }) => ({
            start_date: day(start),
            end_date: day(end),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1_000_000,
          })),
        },
      },
      select: {
        id: true,
        contracts: { select: { id: true }, orderBy: { start_date: 'asc' } },
      },
    });
    const cookie = await signIn(app, {
      userId: user.id,
      role: 'creator',
      creatorId: made.id,
    });
    return {
      userId: user.id,
      creatorId: made.id,
      contractIds: made.contracts.map(({ id }) => id),
      client: as(app, cookie),
      cookie,
    };
  }

  /** Finalizes through the admin's own endpoint, freezing the bonus no content has earned. */
  async function finalize(contractId: string) {
    await admin
      .post(`/invoices/${contractId}/finalize`)
      .send({ acceptPendingBonus: true })
      .expect(201);
  }

  async function saved(contractId: string) {
    return prisma.invoices.findUnique({
      where: { contract_id: contractId },
      select: {
        status: true,
        acknowledged_at: true,
        acknowledged_by: true,
        paid_at: true,
        paid_by: true,
      },
    });
  }

  beforeAll(async () => {
    storage = await mkdtemp(join(tmpdir(), `${MARKER}-`));
    process.env.LOCAL_STORAGE_DIR = storage;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    adminId = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
        select: { id: true },
      })
    ).id;

    savedFormula = await app.get(RateFormulaService).read();
    await admin.put('/rate-formula').send(FORMULA).expect(200);

    const n = await creator('Nadia', [
      { start: -90, end: -31 },
      { start: -30, end: 30 },
    ]);
    nadia = n.client;
    nadiaCookie = n.cookie;
    nadiaUser = n.userId;
    nadiaCreator = n.creatorId;
    [nadiaEarlier, nadiaCurrent] = n.contractIds;

    const k = await creator('Kevin', [{ start: -60, end: -1 }]);
    kevin = k.client;
    [kevinContract] = k.contractIds;

    [sariContract] = (await creator('Sari', [{ start: -60, end: -1 }]))
      .contractIds;
  });

  afterAll(async () => {
    if (savedFormula?.configured) {
      const { configured: _, updatedAt: __, ...formula } = savedFormula;
      await app
        .get(RateFormulaService)
        .replace(
          formula as Parameters<RateFormulaService['replace']>[0],
          undefined,
        );
    } else {
      await prisma.$executeRaw`delete from performance_bonus_tiers`;
      await prisma.$executeRaw`delete from performance_bonus_metrics`;
      await prisma.$executeRaw`delete from rate_formula`;
    }
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({
      where: { email: { startsWith: MARKER } },
    });
    delete process.env.LOCAL_STORAGE_DIR;
    await rm(storage, { recursive: true, force: true });
    await app.close();
  });

  describe('accepts', () => {
    it('the whole flow, keeping who made each move and when', async () => {
      await admin
        .post(`/invoices/${nadiaEarlier}/adjustments`)
        .send({ amount: 50_000, reason: 'Ongkos kirim produk' })
        .expect(201);
      await finalize(nadiaEarlier);

      const acked = await nadia
        .post(`/me/invoices/${nadiaEarlier}/acknowledge`)
        .expect(201);
      expect(acked.body).toEqual({
        invoiceStatus: 'creator_acked',
        acknowledgedAt: expect.stringMatching(ISO),
      });
      expect(await saved(nadiaEarlier)).toEqual({
        status: 'creator_acked',
        acknowledged_at: new Date(acked.body.acknowledgedAt),
        acknowledged_by: nadiaUser,
        paid_at: null,
        paid_by: null,
      });

      await admin
        .post(`/invoices/${nadiaEarlier}/payment-proof`)
        .attach('file', PDF, 'transfer.pdf')
        .expect(201);

      const paid = await nadia
        .post(`/me/invoices/${nadiaEarlier}/confirm-receipt`)
        .expect(201);
      expect(paid.body).toEqual({
        invoiceStatus: 'paid',
        paidAt: expect.stringMatching(ISO),
      });
      expect(await saved(nadiaEarlier)).toEqual({
        status: 'paid',
        acknowledged_at: new Date(acked.body.acknowledgedAt),
        acknowledged_by: nadiaUser,
        paid_at: new Date(paid.body.paidAt),
        paid_by: nadiaUser,
      });

      // The admin reads both of the creator's moves on the invoice's detail.
      const detail = await admin
        .get(`/invoices/${nadiaCreator}`)
        .query({ contract: nadiaEarlier })
        .expect(200);
      expect(detail.body).toMatchObject({
        invoiceStatus: 'paid',
        acknowledgedAt: acked.body.acknowledgedAt,
        paidAt: paid.body.paidAt,
      });
    });

    it("lists the admin's rows with the creator's moves, and drops an earlier contract once it is paid", async () => {
      const listed = await admin
        .get('/invoices')
        .query({ q: `${MARKER} Nadia`, pageSize: 50 })
        .expect(200);
      const rows = listed.body.items as ListedInvoice[];

      // The paid earlier contract has nothing left to do; the running one stays.
      expect(rows.map(({ contract }) => contract.id)).toEqual([nadiaCurrent]);
      expect(rows[0]).toMatchObject({
        invoiceStatus: 'accruing',
        acknowledgedAt: null,
        paidAt: null,
      });

      await finalize(kevinContract);
      const acked = await kevin
        .post(`/me/invoices/${kevinContract}/acknowledge`)
        .expect(201);
      const kevinRows = await admin
        .get('/invoices')
        .query({ q: `${MARKER} Kevin`, pageSize: 50 })
        .expect(200);
      expect(kevinRows.body.items).toEqual([
        expect.objectContaining({
          invoiceStatus: 'creator_acked',
          acknowledgedAt: acked.body.acknowledgedAt,
          paidAt: null,
        }),
      ]);
    });

    it("GET /me/invoices answers the signed-in creator's own invoices, newest period first, with status, snapshot, proof link and comments", async () => {
      await admin
        .post(`/invoices/${nadiaEarlier}/comments`)
        .send({ text: 'Sudah ditransfer ya.' })
        .expect(201);
      await nadia
        .post(`/me/invoices/${nadiaEarlier}/comments`)
        .send({ text: 'Sudah masuk, terima kasih!' })
        .expect(201);

      const res = await nadia.get('/me/invoices').expect(200);
      const [current, earlier] = res.body.items;

      expect(res.body.items).toHaveLength(2);
      expect(current).toMatchObject({
        creatorId: nadiaCreator,
        contract: { id: nadiaCurrent, period: 2 },
        invoiceStatus: 'accruing',
        snapshot: null,
        acknowledgedAt: null,
        paidAt: null,
        paymentProof: null,
        comments: [],
      });
      expect(earlier).toMatchObject({
        contract: { id: nadiaEarlier, period: 1 },
        invoiceStatus: 'paid',
        snapshot: {
          fixedRate: { amount: 1_000_000 },
          adjustments: [{ amount: 50_000, reason: 'Ongkos kirim produk' }],
          total: 1_050_000,
        },
        adjustments: [{ amount: 50_000, reason: 'Ongkos kirim produk' }],
        acknowledgedAt: expect.stringMatching(ISO),
        paidAt: expect.stringMatching(ISO),
        // The creator's own link: the admin's would send them into the admin guard.
        paymentProof: {
          fileName: 'transfer.pdf',
          url: `/api/me/invoices/${nadiaEarlier}/payment-proof`,
          uploadedAt: expect.stringMatching(ISO),
        },
        comments: [
          {
            authorName: 'Admin',
            authorRole: 'admin',
            text: 'Sudah ditransfer ya.',
          },
          {
            authorName: `${MARKER} Nadia`,
            authorRole: 'creator',
            text: 'Sudah masuk, terima kasih!',
          },
        ],
      });

      // OWASP Top 10:2025 A01: who on the admin side recorded an adjustment is not the
      // creator's to read, at the top level or inside the frozen snapshot.
      expect(JSON.stringify(res.body)).not.toContain(adminId);
      expect(JSON.stringify(res.body)).not.toContain('@example.com');
    });

    it('GET /me/invoices answers an empty list for a creator with no contract', async () => {
      const user = await prisma.users.create({
        data: { email: `${MARKER}-tanpa-kontrak@example.com` },
      });
      const made = await prisma.creators.create({
        data: { user_id: user.id, first_name: `${MARKER} Tanpa Kontrak` },
        select: { id: true },
      });
      const fresh = as(
        app,
        await signIn(app, {
          userId: user.id,
          role: 'creator',
          creatorId: made.id,
        }),
      );

      await fresh.get('/me/invoices').expect(200, { items: [] });
    });
  });

  describe('refuses with the reason', () => {
    it('acknowledging an invoice that is still running', async () => {
      const res = await nadia
        .post(`/me/invoices/${nadiaCurrent}/acknowledge`)
        .expect(409);

      expect(res.body).toEqual({
        code: 'INVOICE_NOT_FINALIZED',
        message: 'Invoice belum difinalisasi',
      });
      expect((await saved(nadiaCurrent))?.status ?? 'running').toBe('running');
    });

    it('confirming receipt before the payment proof is uploaded', async () => {
      // Kevin acknowledged in an earlier test; no proof has been uploaded since.
      const res = await kevin
        .post(`/me/invoices/${kevinContract}/confirm-receipt`)
        .expect(409);

      expect(res.body).toEqual({
        code: 'PAYMENT_PROOF_NOT_UPLOADED',
        message: 'Bukti pembayaran belum diunggah',
      });
      expect(await saved(kevinContract)).toMatchObject({
        status: 'creator_acked',
        paid_at: null,
      });
    });

    it('a second acknowledge and a second confirmation', async () => {
      const ackAgain = await kevin
        .post(`/me/invoices/${kevinContract}/acknowledge`)
        .expect(409);
      const ackPaid = await nadia
        .post(`/me/invoices/${nadiaEarlier}/acknowledge`)
        .expect(409);
      const confirmAgain = await nadia
        .post(`/me/invoices/${nadiaEarlier}/confirm-receipt`)
        .expect(409);

      expect(ackAgain.body).toEqual({
        code: 'INVOICE_ALREADY_ACKNOWLEDGED',
        message: 'Invoice sudah di-acknowledge',
      });
      expect(ackPaid.body).toEqual({
        code: 'INVOICE_ALREADY_PAID',
        message: 'Invoice sudah dibayar',
      });
      expect(confirmAgain.body).toEqual(ackPaid.body);
    });
  });

  describe('refuses access', () => {
    // OWASP Top 10:2025 A01 (Broken Access Control): a creator moves only their own invoice.
    it('"Akses ditolak" on another creator\'s invoice, changing nothing', async () => {
      await finalize(sariContract);
      const before = await saved(sariContract);

      const ack = await kevin
        .post(`/me/invoices/${sariContract}/acknowledge`)
        .expect(403);
      const confirm = await kevin
        .post(`/me/invoices/${sariContract}/confirm-receipt`)
        .expect(403);

      expect(ack.body).toEqual({
        code: 'INVOICE_ACCESS_DENIED',
        message: 'Akses ditolak',
      });
      expect(confirm.body).toEqual(ack.body);
      expect(await saved(sariContract)).toEqual(before);
    });

    it('a contract that does not exist, as not found', async () => {
      const res = await kevin
        .post('/me/invoices/00000000-0000-4000-8000-000000000000/acknowledge')
        .expect(404);

      expect(res.body).toEqual({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice tidak ditemukan',
      });
    });

    it('a contract id that is not a UUID, before any query', async () => {
      await kevin.post('/me/invoices/not-a-uuid/acknowledge').expect(400);
    });

    it.each([
      ['get', '/me/invoices'],
      ['post', '/me/invoices/{c}/acknowledge'],
      ['post', '/me/invoices/{c}/confirm-receipt'],
    ] as const)('%s %s without a session', async (method, path) => {
      const res = await request(app.getHttpServer())
        [method](path.replace('{c}', sariContract))
        .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:3000')
        .set('Sec-Fetch-Site', 'same-origin');

      expect(res.status).toBe(401);
    });

    it("an admin on the creator's routes", async () => {
      await admin.get('/me/invoices').expect(401);
      await admin.post(`/me/invoices/${sariContract}/acknowledge`).expect(401);
    });

    // OWASP Top 10:2025 A01: a move sent from another site is refused before it is read.
    it("an acknowledge without the browser's own origin, changing nothing", async () => {
      const before = await saved(sariContract);

      await request(app.getHttpServer())
        .post(`/me/invoices/${nadiaCurrent}/acknowledge`)
        .set('Cookie', nadiaCookie)
        .set('Origin', 'https://evil.example')
        .expect(403);

      expect(await saved(sariContract)).toEqual(before);
    });
  });

  describe('edge:', () => {
    // OWASP Top 10:2025 A06 (Insecure Design): two acknowledges at once move the invoice once.
    it('two acknowledges at once: one wins, the other is told it is already acknowledged', async () => {
      const sari = await prisma.creators.findFirstOrThrow({
        where: { contracts: { some: { id: sariContract } } },
        select: { id: true, user_id: true },
      });
      const sariClient = as(
        app,
        await signIn(app, {
          userId: sari.user_id,
          role: 'creator',
          creatorId: sari.id,
        }),
      );

      const answers = await Promise.all([
        sariClient.post(`/me/invoices/${sariContract}/acknowledge`),
        sariClient.post(`/me/invoices/${sariContract}/acknowledge`),
      ]);

      expect(answers.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(answers.find(({ status }) => status === 409)?.body.code).toBe(
        'INVOICE_ALREADY_ACKNOWLEDGED',
      );
      expect(await saved(sariContract)).toMatchObject({
        status: 'creator_acked',
        acknowledged_by: sari.user_id,
      });
    });

    // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the database itself refuses
    // a status past a step that kept no actor and time, whatever code writes it.
    it.each([
      ['creator_acked', 'no acknowledgement', {}],
      ['payment_uploaded', 'an acknowledgement without its actor', { at: true }],
      ['paid', 'no receipt confirmation', { at: true, by: true }],
      ['finalized', 'a receipt confirmation', { paid: true }],
    ] as const)(
      'the database refuses a %s invoice with %s',
      async (status, _, moves: { at?: boolean; by?: boolean; paid?: boolean }) => {
        const integrity = await creator(`Integritas-${status}`, [
          { start: -60, end: -1 },
        ]);
        const now = new Date();

        await expect(
          prisma.invoices.create({
            data: {
              contract_id: integrity.contractIds[0],
              status,
              finalized_at: now,
              snapshot: {},
              acknowledged_at: moves.at ? now : null,
              acknowledged_by: moves.by ? integrity.userId : null,
              paid_at: moves.paid ? now : null,
              paid_by: moves.paid ? integrity.userId : null,
            },
          }),
        ).rejects.toThrow(/invoices_(acknowledged|paid)_check/);
      },
    );
  });
});
