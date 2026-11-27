import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { adminActor } from '../src/contents/content-event-actors.js';
import { jakartaMidnight } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// PBI-23, 23.10 against the real schema: content timelines and invoice activity name the acting
// Admin by the account's name, or its email while it has none, and the creator never receives the
// Admin's id or who recorded an adjustment (OWASP A01, A09).

const MARKER = 'e2e-admin-names';
const ADMIN_EMAIL = `${MARKER}-signed-in-admin@example.com`;
const ADMIN_NAME = 'Sinta Dewi';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');

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

interface ActivityFields {
  finalizedBy: string | null;
  paymentProof: { uploadedBy: string } | null;
  adjustments: { actorId?: string; actorName?: string }[];
  rateChanges?: { actorName?: string }[];
  comments?: { authorName: string; authorRole: string }[];
}

describe('Admin names in history (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: string;
  let admin: ReturnType<typeof as>;
  let creator: ReturnType<typeof as>;
  let adminId: string;
  let creatorId: string;
  let contractId: string;
  let contentId: string;

  const setAdmin = (data: { name?: string | null; is_active?: boolean }) =>
    prisma.users.update({ where: { id: adminId }, data });

  async function adminView(): Promise<ActivityFields> {
    const { body } = await admin
      .get(`/invoices/${creatorId}`)
      .query({ contract: contractId })
      .expect(200);
    return body as ActivityFields;
  }

  async function creatorRead(): Promise<{
    invoice: ActivityFields;
    raw: string;
  }> {
    const res = await creator.get('/me/invoices').expect(200);
    const [invoice] = res.body.items as ActivityFields[];
    return { invoice, raw: JSON.stringify(res.body) };
  }

  async function timelineActor() {
    const { body } = await admin.get(`/contents/${contentId}`).expect(200);
    const [event] = body.events as { actor: unknown }[];
    return event.actor;
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
    ({ id: adminId } = await prisma.users.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    }));

    const user = await prisma.users.create({
      data: { email: `${MARKER}-creator@example.com` },
    });
    const made = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} Nadia`,
        contracts: {
          create: {
            start_date: day(-90),
            end_date: day(-10),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1_000_000,
          },
        },
      },
      select: { id: true, contracts: { select: { id: true } } },
    });
    creatorId = made.id;
    contractId = made.contracts[0].id;
    creator = as(
      app,
      await signIn(app, { userId: user.id, role: 'creator', creatorId }),
    );

    const content = await prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} konten`,
        type: 'evergreen',
        deadline: day(-30),
      },
      select: { id: true },
    });
    contentId = content.id;
    await prisma.content_events.create({
      data: {
        content_id: contentId,
        event_type: 'Scheduled',
        ...adminActor(adminId),
        event_data: {},
      },
    });

    // An adjustment is recorded while the invoice runs; the invoice then waits for its proof.
    const invoice = await prisma.invoices.create({
      data: { contract_id: contractId },
      select: { id: true },
    });
    await prisma.invoice_adjustments.create({
      data: {
        invoice_id: invoice.id,
        amount: 25_000,
        reason: 'Ongkos kirim',
        actor_user_id: adminId,
      },
    });
    // Ubah Data changed the fixed rate while it ran (PBI-16), so Aktivitas tells that too.
    await prisma.invoice_rate_changes.create({
      data: {
        invoice_id: invoice.id,
        old_rate: 1_000_000,
        new_rate: 1_200_000,
        actor_user_id: adminId,
      },
    });
    await prisma.invoices.update({
      where: { id: invoice.id },
      data: {
        status: 'creator_acked',
        snapshot: {},
        finalized_at: new Date(),
        finalized_by: adminId,
        acknowledged_at: new Date(),
        acknowledged_by: user.id,
        // An acknowledged invoice is issued, so it carries its number (PBI-31); unique per run.
        invoice_number: `TOF-INV-199901-${Date.now()}`,
      },
    });

    await admin
      .post(`/invoices/${contractId}/payment-proof`)
      .attach('file', PDF, 'transfer.pdf')
      .expect(201);
    await admin
      .post(`/invoices/${contractId}/comments`)
      .send({ text: 'Sudah ditransfer ya.' })
      .expect(201);
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

  beforeEach(async () => {
    await setAdmin({ name: ADMIN_NAME, is_active: true });
  });

  it('names the Admin by account name on every step the Admin reads', async () => {
    const view = await adminView();

    expect(view.finalizedBy).toBe(ADMIN_NAME);
    expect(view.paymentProof?.uploadedBy).toBe(ADMIN_NAME);
    expect(view.adjustments).toEqual([
      expect.objectContaining({ actorId: adminId, actorName: ADMIN_NAME }),
    ]);
    // QA: a fixed-rate change named the Admin by email although the account had a name.
    expect(view.rateChanges).toEqual([
      expect.objectContaining({ actorName: ADMIN_NAME }),
    ]);
    await expect(timelineActor()).resolves.toEqual({
      name: ADMIN_NAME,
      role: 'admin',
    });
  });

  it('falls back to the email while the account has no name', async () => {
    await setAdmin({ name: null });

    const view = await adminView();

    expect(view.finalizedBy).toBe(ADMIN_EMAIL);
    expect(view.paymentProof?.uploadedBy).toBe(ADMIN_EMAIL);
    expect(view.adjustments[0].actorName).toBe(ADMIN_EMAIL);
    expect(view.rateChanges?.[0].actorName).toBe(ADMIN_EMAIL);
    await expect(timelineActor()).resolves.toEqual({
      name: ADMIN_EMAIL,
      role: 'admin',
    });
  });

  it('shows the creator who finalized, sent the proof and commented on their invoice', async () => {
    const { invoice } = await creatorRead();

    expect(invoice.finalizedBy).toBe(ADMIN_NAME);
    expect(invoice.paymentProof?.uploadedBy).toBe(ADMIN_NAME);
    expect(invoice.comments).toEqual([
      expect.objectContaining({ authorName: ADMIN_NAME, authorRole: 'admin' }),
    ]);
  });

  // PBI-23 AC 25 and OWASP A01: the creator reads who recorded an adjustment, never their id.
  it("names the Admin on the creator's adjustment without sending the Admin's id", async () => {
    const { invoice, raw } = await creatorRead();

    expect(raw).not.toContain(adminId);
    expect(invoice.adjustments).toHaveLength(1);
    expect(invoice.adjustments[0]).not.toHaveProperty('actorId');
    expect(invoice.adjustments[0].actorName).toBe(ADMIN_NAME);
  });

  // PBI-23: accounts are never hard-deleted, so the names on finalized invoices stay.
  it('keeps the name of an Admin who was deactivated later', async () => {
    await setAdmin({ is_active: false });

    const { invoice } = await creatorRead();

    expect(invoice.finalizedBy).toBe(ADMIN_NAME);
    expect(invoice.paymentProof?.uploadedBy).toBe(ADMIN_NAME);
  });

  it('refuses a creator on the Admin invoice read that carries the adjustment names', async () => {
    await creator.get(`/invoices/${creatorId}`).expect(403);
  });
});
