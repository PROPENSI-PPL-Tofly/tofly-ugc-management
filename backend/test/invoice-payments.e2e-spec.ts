import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { jakartaMidnight } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

const MARKER = 'e2e-invoice-payments';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest of the image'),
]);

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

/** Reads a response body as raw bytes, whatever its type. */
function bytes(
  res: request.Response,
  done: (error: Error | null, body: Buffer) => void,
) {
  // In Node, superagent hands the parser the response stream itself.
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('Invoice payment proof and comments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: string;
  let admin: ReturnType<typeof as>;
  let adminCookie: string;
  let nadia: ReturnType<typeof as>;
  let kevin: ReturnType<typeof as>;
  let nadiaContract: string;
  let kevinContract: string;
  let sariContract: string;

  /** Creates a creator under the marker with one contract, and signs them in. */
  async function creator(name: string, start: number, end: number) {
    const user = await prisma.users.create({
      data: { email: `${MARKER}-${name.toLowerCase()}@example.com` },
    });
    const made = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} ${name}`,
        contracts: {
          create: {
            start_date: day(start),
            end_date: day(end),
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
    return {
      creatorId: made.id,
      contractId: made.contracts[0].id,
      client: as(app, cookie),
      cookie,
    };
  }

  /** The user of the contract's creator, who makes the creator's moves on its invoice. */
  async function creatorUserOf(contractId: string): Promise<string> {
    const contract = await prisma.contracts.findUniqueOrThrow({
      where: { id: contractId },
      select: { creators: { select: { user_id: true } } },
    });
    return contract.creators.user_id;
  }

  /**
   * Puts a contract's invoice where 13.1 leaves it once the creator acknowledged it, with the
   * actor and time the database requires of an acknowledged invoice.
   */
  async function acknowledged(contractId: string) {
    const acknowledgedBy = await creatorUserOf(contractId);
    const moved = {
      status: 'creator_acked' as const,
      finalized_at: new Date(),
      snapshot: {},
      acknowledged_at: new Date(),
      acknowledged_by: acknowledgedBy,
    };
    await prisma.invoices.upsert({
      where: { contract_id: contractId },
      create: { contract_id: contractId, ...moved },
      update: moved,
    });
  }

  async function storedFiles(): Promise<string[]> {
    return readdir(join(storage, 'payment-proofs')).catch(() => []);
  }

  beforeAll(async () => {
    // The local file store keeps this suite's files in a folder of its own.
    storage = await mkdtemp(join(tmpdir(), `${MARKER}-`));
    process.env.LOCAL_STORAGE_DIR = storage;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    adminCookie = await signInAsAdmin(app, prisma, MARKER);
    admin = as(app, adminCookie);

    const n = await creator('Nadia', -90, -10);
    nadia = n.client;
    nadiaContract = n.contractId;

    const k = await creator('Kevin', -10, 60);
    kevin = k.client;
    kevinContract = k.contractId;

    sariContract = (await creator('Sari', -90, -10)).contractId;
  });

  afterAll(async () => {
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
    it('the whole payment proof flow: upload, status, listing, and both sides opening the same file', async () => {
      await acknowledged(nadiaContract);

      const uploaded = await admin
        .post(`/invoices/${nadiaContract}/payment-proof`)
        .attach('file', PDF, 'Transfer Agustus ✅.pdf')
        .expect(201);

      expect(uploaded.body).toEqual({
        fileName: 'Transfer Agustus ✅.pdf',
        url: `/api/invoices/${nadiaContract}/payment-proof`,
        uploadedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        invoiceStatus: 'payment_uploaded',
      });

      const invoice = await prisma.invoices.findUniqueOrThrow({
        where: { contract_id: nadiaContract },
        select: {
          status: true,
          payment_proof: { select: { object_key: true, size_bytes: true } },
        },
      });
      expect(invoice.status).toBe('payment_uploaded');
      expect(invoice.payment_proof?.size_bytes).toBe(PDF.length);
      expect(
        await readFile(
          join(storage, 'payment-proofs', invoice.payment_proof!.object_key),
        ),
      ).toEqual(PDF);

      const listed = await admin
        .get('/invoices')
        .query({ q: `${MARKER} Nadia`, pageSize: 50 })
        .expect(200);
      const row = (
        listed.body.items as {
          contract: { id: string };
          paymentProof: unknown;
        }[]
      ).find(({ contract }) => contract.id === nadiaContract);
      expect(row?.paymentProof).toEqual({
        fileName: 'Transfer Agustus ✅.pdf',
        url: `/api/invoices/${nadiaContract}/payment-proof`,
        uploadedAt: uploaded.body.uploadedAt,
      });

      const asAdmin = await admin
        .get(`/invoices/${nadiaContract}/payment-proof`)
        .buffer(true)
        .parse(bytes)
        .expect(200);
      expect(asAdmin.body).toEqual(PDF);
      expect(asAdmin.headers['content-type']).toBe('application/pdf');
      expect(asAdmin.headers['x-content-type-options']).toBe('nosniff');

      const asCreator = await nadia
        .get(`/me/invoices/${nadiaContract}/payment-proof`)
        .buffer(true)
        .parse(bytes)
        .expect(200);
      expect(asCreator.body).toEqual(PDF);
    });

    it('one thread both sides write in and read the same, oldest first', async () => {
      await admin
        .post(`/invoices/${nadiaContract}/comments`)
        .send({ text: 'Bukti transfer sudah diupload ya.' })
        .expect(201);
      await nadia
        .post(`/me/invoices/${nadiaContract}/comments`)
        .send({ text: '  Sudah masuk, terima kasih!  ' })
        .expect(201);

      const asAdmin = await admin
        .get(`/invoices/${nadiaContract}/comments`)
        .expect(200);
      const asCreator = await nadia
        .get(`/me/invoices/${nadiaContract}/comments`)
        .expect(200);

      expect(asCreator.body).toEqual(asAdmin.body);
      expect(
        (
          asAdmin.body as {
            authorName: string;
            authorRole: string;
            text: string;
          }[]
        ).map(({ authorName, authorRole, text }) => ({
          authorName,
          authorRole,
          text,
        })),
      ).toEqual([
        {
          authorName: 'Admin',
          authorRole: 'admin',
          text: 'Bukti transfer sudah diupload ya.',
        },
        {
          authorName: `${MARKER} Nadia`,
          authorRole: 'creator',
          text: 'Sudah masuk, terima kasih!',
        },
      ]);
      // No admin email anywhere in what a creator reads.
      expect(JSON.stringify(asCreator.body)).not.toContain('@example.com');
    });
  });

  describe('refuses', () => {
    it.each([
      ['get', '/invoices/{c}/comments'],
      ['post', '/invoices/{c}/comments'],
      ['get', '/invoices/{c}/payment-proof'],
      ['post', '/invoices/{c}/payment-proof'],
      ['get', '/me/invoices/{c}/comments'],
      ['post', '/me/invoices/{c}/comments'],
      ['get', '/me/invoices/{c}/payment-proof'],
    ] as const)('%s %s without a session', async (method, path) => {
      // Sent from the app's own origin, so only the missing session refuses it.
      const res = await request(app.getHttpServer())
        [method](path.replace('{c}', nadiaContract))
        .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:3000')
        .set('Sec-Fetch-Site', 'same-origin');

      expect(res.status).toBe(401);
    });

    it('a creator on the admin routes', async () => {
      const read = await nadia.get(`/invoices/${nadiaContract}/comments`);
      const upload = await nadia
        .post(`/invoices/${nadiaContract}/payment-proof`)
        .attach('file', PDF, 'a.pdf');

      expect(read.status).toBe(403);
      expect(upload.status).toBe(403);
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): a change sent from another site is
    // refused before it is read.
    it("a comment or an upload without the browser's own origin, writing nothing", async () => {
      const before = await prisma.invoice_comments.count({
        where: { invoices: { contract_id: kevinContract } },
      });

      await request(app.getHttpServer())
        .post(`/invoices/${kevinContract}/comments`)
        .set('Cookie', adminCookie)
        .send({ text: 'Dari situs lain' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/invoices/${sariContract}/payment-proof`)
        .set('Cookie', adminCookie)
        .set('Origin', 'https://evil.example')
        .attach('file', PDF, 'a.pdf')
        .expect(403);

      expect(
        await prisma.invoice_comments.count({
          where: { invoices: { contract_id: kevinContract } },
        }),
      ).toBe(before);
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): another creator's contract answers as a
    // missing one, and nothing is written to it.
    it("another creator's thread and proof, as not found", async () => {
      const thread = await admin.get(`/invoices/${nadiaContract}/comments`);

      await kevin.get(`/me/invoices/${nadiaContract}/comments`).expect(404);
      await kevin
        .post(`/me/invoices/${nadiaContract}/comments`)
        .send({ text: 'Bukan kontrak saya' })
        .expect(404);
      await kevin
        .get(`/me/invoices/${nadiaContract}/payment-proof`)
        .expect(404);

      expect(
        (await admin.get(`/invoices/${nadiaContract}/comments`)).body,
      ).toEqual(thread.body);
    });

    it('a second proof once one is uploaded, keeping the first', async () => {
      const filesBefore = await storedFiles();

      const res = await admin
        .post(`/invoices/${nadiaContract}/payment-proof`)
        .attach('file', PNG, 'lagi.png')
        .expect(409);

      expect(res.body.code).toBe('INVOICE_NOT_AWAITING_PROOF');
      expect(await storedFiles()).toEqual(filesBefore);
    });

    it('a program renamed .png, recording and storing nothing', async () => {
      await acknowledged(sariContract);
      const filesBefore = await storedFiles();

      const res = await admin
        .post(`/invoices/${sariContract}/payment-proof`)
        .attach('file', Buffer.from('MZ\x90\x00 not an image'), {
          filename: 'bukti.png',
          contentType: 'image/png',
        })
        .expect(422);

      expect(res.body).toEqual({
        code: 'PROOF_INVALID',
        message: 'File bukti pembayaran harus PDF, JPG, atau PNG.',
      });
      expect(await storedFiles()).toEqual(filesBefore);
      expect(
        await prisma.invoices.findUniqueOrThrow({
          where: { contract_id: sariContract },
          select: { status: true },
        }),
      ).toEqual({ status: 'creator_acked' });
    });
  });

  describe('edge:', () => {
    // OWASP Top 10:2025 A06 (Insecure Design): two admins uploading at once leave exactly one
    // proof, one status change and one stored file.
    it('two uploads at once: one wins, the other is refused and leaves no file behind', async () => {
      await acknowledged(sariContract);
      const filesBefore = await storedFiles();

      const answers = await Promise.all([
        admin
          .post(`/invoices/${sariContract}/payment-proof`)
          .attach('file', PDF, 'pertama.pdf'),
        admin
          .post(`/invoices/${sariContract}/payment-proof`)
          .attach('file', PNG, 'kedua.png'),
      ]);

      expect(answers.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(
        await prisma.invoice_payment_proofs.count({
          where: { invoices: { contract_id: sariContract } },
        }),
      ).toBe(1);
      expect((await storedFiles()).length).toBe(filesBefore.length + 1);
    });

    it('a first comment on a contract nobody has invoiced yet opens its invoice row', async () => {
      expect(
        await prisma.invoices.count({ where: { contract_id: kevinContract } }),
      ).toBe(0);

      await kevin
        .post(`/me/invoices/${kevinContract}/comments`)
        .send({ text: 'Halo kak, invoice saya kapan dihitung?' })
        .expect(201);

      expect(
        await prisma.invoices.findUniqueOrThrow({
          where: { contract_id: kevinContract },
          select: { status: true },
        }),
      ).toEqual({ status: 'running' });
    });

    it.each([
      'running',
      'finalized',
      'creator_acked',
      'payment_uploaded',
      'paid',
    ] as const)('takes comments while the invoice is %s', async (status) => {
      const frozen = status !== 'running';
      // Each status holds the creator's moves it is past, as the database requires.
      const acked = !['running', 'finalized'].includes(status);
      const paid = status === 'paid';
      const creatorUser = await creatorUserOf(kevinContract);
      await prisma.invoices.update({
        where: { contract_id: kevinContract },
        data: {
          status,
          finalized_at: frozen ? new Date() : null,
          snapshot: frozen ? {} : undefined,
          acknowledged_at: acked ? new Date() : null,
          acknowledged_by: acked ? creatorUser : null,
          paid_at: paid ? new Date() : null,
          paid_by: paid ? creatorUser : null,
        },
      });

      const fromAdmin = await admin
        .post(`/invoices/${kevinContract}/comments`)
        .send({ text: `Status ${status}` });
      const fromCreator = await kevin
        .post(`/me/invoices/${kevinContract}/comments`)
        .send({ text: `Status ${status}` });

      expect([fromAdmin.status, fromCreator.status]).toEqual([201, 201]);
      expect(fromCreator.body).toMatchObject({
        authorRole: 'creator',
        text: `Status ${status}`,
      });
    });

    it("removes a contract's proof and thread with the contract", async () => {
      await prisma.contracts.delete({ where: { id: sariContract } });

      expect(
        await prisma.invoice_payment_proofs.count({
          where: { invoices: { contract_id: sariContract } },
        }),
      ).toBe(0);
    });
  });
});
