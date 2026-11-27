import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { jakartaDay, jakartaMidnight } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RateFormulaService } from '../src/rate-formula/rate-formula.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// PBI-31 (31.2): the invoice PDF once the creator acknowledged it, the receipt once it is paid,
// for the admin and for the creator who owns it only, walked through the real endpoints.

const MARKER = 'e2e-invoice-pdf';
const PROOF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');

const FORMULA = {
  latePenaltyPerDay: 50_000,
  maxPenaltyDays: 3,
  specificBonus: 100_000,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [{ threshold: 10_000, bonus: 150_000 }],
    },
    tiktok: { metric: 'views', tiers: [{ threshold: 10_000, bonus: 150_000 }] },
  },
} as const;

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

/** The worksheet XML of an xlsx (a ZIP of deflated parts), read without an xlsx library. */
function worksheet(xlsx: Buffer): string {
  let offset = 0;
  while (xlsx.readUInt32LE(offset) === 0x04034b50) {
    const size = xlsx.readUInt32LE(offset + 18);
    const nameLength = xlsx.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength + xlsx.readUInt16LE(offset + 28);
    const name = xlsx
      .subarray(offset + 30, offset + 30 + nameLength)
      .toString('utf8');
    if (name === 'xl/worksheets/sheet1.xml') {
      return inflateRawSync(xlsx.subarray(start, start + size)).toString(
        'utf8',
      );
    }
    offset = start + size;
  }
  throw new Error('no worksheet in the xlsx');
}

/** Reads a binary answer whole, so its first bytes can be checked. */
function binary(test: request.Test) {
  return test.buffer(true).parse((response, done) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => done(null, Buffer.concat(chunks)));
  });
}

describe('Invoice and receipt PDFs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: string;
  let savedFormula: Awaited<ReturnType<RateFormulaService['read']>>;
  let admin: ReturnType<typeof as>;
  let owner: ReturnType<typeof as>;
  let stranger: ReturnType<typeof as>;
  let contractId: string;
  let runningContractId: string;

  async function creator(name: string) {
    const user = await prisma.users.create({
      data: { email: `${MARKER}-${name.toLowerCase()}@example.com` },
    });
    const made = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} ${name}`,
        contracts: {
          create: {
            start_date: day(-60),
            end_date: day(-1),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1_000_000,
          },
        },
      },
      select: { id: true, contracts: { select: { id: true } } },
    });
    const cookie = await signIn(app, {
      userId: user.id,
      role: 'creator',
      creatorId: made.id,
    });
    return { client: as(app, cookie), contractId: made.contracts[0].id };
  }

  beforeAll(async () => {
    // Real sessions only, whatever an earlier file left the dev sign-in switch at.
    vi.stubEnv('DEV_AUTH_ENABLED', 'false');
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
    savedFormula = await app.get(RateFormulaService).read();
    await admin.put('/rate-formula').send(FORMULA).expect(200);

    const rani = await creator('Rani');
    owner = rani.client;
    contractId = rani.contractId;
    const bayu = await creator('Bayu');
    stranger = bayu.client;
    runningContractId = bayu.contractId;
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
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    delete process.env.LOCAL_STORAGE_DIR;
    await rm(storage, { recursive: true, force: true });
    await app.close();
    vi.unstubAllEnvs();
  });

  it('offers neither document before the creator acknowledges, then the invoice, then the receipt once paid', async () => {
    await admin
      .post(`/invoices/${contractId}/finalize`)
      .send({ acceptPendingBonus: true })
      .expect(201);

    // Final: an adjustment can still change it, so nothing is issued yet.
    const early = await admin
      .get(`/invoices/${contractId}/invoice-pdf`)
      .expect(409);
    expect(early.body.code).toBe('INVOICE_PDF_UNAVAILABLE');

    await owner.post(`/me/invoices/${contractId}/acknowledge`).expect(201);

    const invoice = await binary(
      admin.get(`/invoices/${contractId}/invoice-pdf`),
    ).expect(200);
    expect(invoice.headers['content-type']).toBe('application/pdf');
    expect(invoice.headers['content-disposition']).toBe(
      `attachment; filename*=UTF-8''Invoice_${encodeURIComponent(`${MARKER}Rani`)}_Periode1.pdf`,
    );
    expect((invoice.body as Buffer).subarray(0, 5).toString('latin1')).toBe(
      '%PDF-',
    );

    const notPaid = await owner
      .get(`/me/invoices/${contractId}/receipt-pdf`)
      .expect(409);
    expect(notPaid.body.code).toBe('RECEIPT_PDF_UNAVAILABLE');

    await admin
      .post(`/invoices/${contractId}/payment-proof`)
      .attach('file', PROOF, 'transfer.pdf')
      .expect(201);
    await owner.post(`/me/invoices/${contractId}/confirm-receipt`).expect(201);

    const receipt = await binary(
      owner.get(`/me/invoices/${contractId}/receipt-pdf`),
    ).expect(200);
    expect(receipt.headers['content-type']).toBe('application/pdf');
    expect(receipt.headers['cache-control']).toBe('private, no-store');
    expect((receipt.body as Buffer).subarray(0, 5).toString('latin1')).toBe(
      '%PDF-',
    );

    const numbers = await prisma.invoices.findUniqueOrThrow({
      where: { contract_id: contractId },
      select: { invoice_number: true, receipt_number: true },
    });
    expect(numbers.invoice_number).toMatch(/^TOF-INV-\d{6}-\d{3,}$/);
    expect(numbers.receipt_number).toMatch(/^TOF-RCP-\d{6}-\d{3,}$/);
  });

  // PBI-31 AC 7: the recap is one xlsx, and its number is the one the invoice's PDF carries.
  it('exports the paid invoice as one xlsx under its issued number, named for the Jakarta day', async () => {
    const { invoice_number } = await prisma.invoices.findUniqueOrThrow({
      where: { contract_id: contractId },
      select: { invoice_number: true },
    });

    const recap = await binary(
      admin
        .post('/invoices/bulk-export')
        .send({ invoiceIds: [contractId, runningContractId] }),
    ).expect(201);

    expect(recap.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const day = jakartaDay(new Date()).replace(/-/g, '');
    expect(recap.headers['content-disposition']).toBe(
      `attachment; filename*=UTF-8''Rekap_Invoice_${day}.xlsx`,
    );
    const sheet = worksheet(recap.body as Buffer);
    expect(sheet).toContain(`<t>${invoice_number}</t>`);
    expect(sheet).not.toContain('<row r="3">');
  });

  // PBI-31 AC 8: nothing to put in the file is said, not answered with an empty sheet.
  it('refuses a recap of only a running invoice with 422 and no file', async () => {
    const refused = await admin
      .post('/invoices/bulk-export')
      .send({ invoiceIds: [runningContractId] })
      .expect(422);
    expect(refused.body).toEqual({
      code: 'INVOICE_EXPORT_EMPTY',
      message: 'Tidak ada invoice yang bisa diunduh.',
    });
  });

  // OWASP Top 10:2025 A01 (Broken Access Control), AC 6.
  it("refuses a creator another creator's invoice and receipt", async () => {
    await stranger.get(`/me/invoices/${contractId}/invoice-pdf`).expect(403);
    await stranger.get(`/me/invoices/${contractId}/receipt-pdf`).expect(403);
  });

  it('asks for a session on both sides', async () => {
    await request(app.getHttpServer())
      .get(`/invoices/${contractId}/invoice-pdf`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/me/invoices/${contractId}/receipt-pdf`)
      .expect(401);
  });
});
