import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { jakartaMidnight } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RateFormulaService } from '../src/rate-formula/rate-formula.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// PBI-14 (14.1): a creator proposes a Specific content while the contract runs and withdraws it
// while nobody has decided on it, walked through the real endpoints and the real database.

const MARKER = 'e2e-creator-proposals';

const FORMULA = {
  latePenaltyPerDay: 50_000,
  maxPenaltyDays: 3,
  specificBonus: 100_000,
  performanceBonus: {
    instagram: { metric: 'views', tiers: [{ threshold: 10_000, bonus: 150_000 }] },
    tiktok: { metric: 'views', tiers: [{ threshold: 10_000, bonus: 150_000 }] },
  },
} as const;

/** A calendar day relative to today in Jakarta, as a date and as YYYY-MM-DD. */
function day(offset: number): Date {
  const today = jakartaMidnight(new Date());
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset),
  );
}
const iso = (offset: number) => day(offset).toISOString().slice(0, 10);

interface Contract {
  start: number;
  end: number;
}

describe('Creator proposals (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let savedFormula: Awaited<ReturnType<RateFormulaService['read']>>;
  let admin: ReturnType<typeof as>;
  let rani: Awaited<ReturnType<typeof creator>>;
  let bayu: Awaited<ReturnType<typeof creator>>;
  let cici: Awaited<ReturnType<typeof creator>>;
  let dina: Awaited<ReturnType<typeof creator>>;

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
      select: { id: true, contracts: { select: { id: true }, orderBy: { start_date: 'asc' } } },
    });
    const cookie = await signIn(app, { userId: user.id, role: 'creator', creatorId: made.id });
    return {
      userId: user.id,
      creatorId: made.id,
      contractIds: made.contracts.map(({ id }) => id),
      client: as(app, cookie),
    };
  }

  /** A proposal body whose deadline is `offset` days from today, valid unless a test says not. */
  const body = (offset = 20, over: Record<string, unknown> = {}) => ({
    name: 'Unboxing Paket Besar',
    brief: 'Tunjukkan proses kirim paket besar dari awal sampai tiba.',
    deadline: iso(offset),
    notes: 'Pakai produk di rumah.',
    ...over,
  });

  beforeAll(async () => {
    // Real sessions only, whatever an earlier file left the dev sign-in switch at.
    vi.stubEnv('DEV_AUTH_ENABLED', 'false');
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    savedFormula = await app.get(RateFormulaService).read();
    await admin.put('/rate-formula').send(FORMULA).expect(200);

    rani = await creator('Rani', [{ start: -60, end: 60 }]);
    bayu = await creator('Bayu', [{ start: -120, end: -10 }]);
    cici = await creator('Cici', [{ start: 10, end: 90 }]);
    dina = await creator('Dina', [{ start: -60, end: 60 }]);
  });

  afterAll(async () => {
    if (savedFormula?.configured) {
      const { configured: _, updatedAt: __, ...formula } = savedFormula;
      await app
        .get(RateFormulaService)
        .replace(formula as Parameters<RateFormulaService['replace']>[0], undefined);
    } else {
      await prisma.$executeRaw`delete from performance_bonus_tiers`;
      await prisma.$executeRaw`delete from performance_bonus_metrics`;
      await prisma.$executeRaw`delete from rate_formula`;
    }
    await prisma.creators.deleteMany({ where: { first_name: { startsWith: MARKER } } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
    vi.unstubAllEnvs();
  });

  const count = (creatorId: string) =>
    prisma.contents.count({ where: { contracts: { creator_id: creatorId } } });

  describe('proposing', () => {
    it('saves a pending Specific content on the running contract, with its first step by the creator (AC 1, 2)', async () => {
      const res = await rani.client.post('/me/contents/proposals').send(body()).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Unboxing Paket Besar',
        type: 'specific',
        brief: 'Tunjukkan proses kirim paket besar dari awal sampai tiba.',
        notes: 'Pakai produk di rumah.',
        deadline: iso(20),
        status: 'pending',
      });
      const saved = await prisma.contents.findUniqueOrThrow({
        where: { id: res.body.id },
        include: { content_events: true },
      });
      expect(saved).toMatchObject({
        contract_id: rani.contractIds[0],
        type: 'specific',
        status: 'pending',
        proposal_notes: 'Pakai produk di rumah.',
      });
      expect(saved.content_events).toHaveLength(1);
      expect(saved.content_events[0]).toMatchObject({
        event_type: 'Scheduled',
        actor_role: 'creator',
        actor_name: `${MARKER} Rani`,
      });
    });

    it('takes the first and the last day the contract leaves open', async () => {
      const first = await dina.client.post('/me/contents/proposals').send(body(5, { name: 'Hari pertama' }));
      const last = await dina.client.post('/me/contents/proposals').send(body(55, { name: 'Hari terakhir' }));

      expect([first.status, last.status]).toEqual([201, 201]);
    });

    // AC 2: from today plus the buffer, up to the contract end less the buffer.
    it.each([
      ['a day before the window', 4, 'Deadline paling cepat'],
      ['a day past the H-5 line', 56, 'Deadline paling lambat'],
    ])('refuses %s with the window in the message, saving nothing', async (_label, offset, message) => {
      const before = await count(rani.creatorId);

      const res = await rani.client.post('/me/contents/proposals').send(body(offset)).expect(422);

      expect(res.body.errors.deadline).toContain(message);
      expect(await count(rani.creatorId)).toBe(before);
    });

    it('answers every wrong field at once, and refuses a body that is not a form', async () => {
      const res = await rani.client
        .post('/me/contents/proposals')
        .send({ name: '', brief: 'b'.repeat(1001), deadline: 'soon', notes: 'n'.repeat(501) })
        .expect(422);

      expect(res.body.errors).toEqual({
        name: 'Nama konten wajib diisi',
        brief: 'Brief maksimal 1000 karakter',
        deadline: 'Format deadline tidak valid',
        notes: 'Catatan maksimal 500 karakter',
      });
      await rani.client.post('/me/contents/proposals').send([]).expect(422);
    });

    // OWASP Top 10:2025 A01 (Broken Access Control), AC 3.
    it('refuses a creator whose contract has not started with 403, saving nothing', async () => {
      const res = await cici.client.post('/me/contents/proposals').send(body()).expect(403);

      expect(res.body.code).toBe('NO_ACTIVE_CONTRACT');
      expect(await count(cici.creatorId)).toBe(0);
    });

    // Once a contract ended and its invoice is waiting for payment, the creator reaches Pembayaran
    // alone (PBI-37 AC 13), so the proposal route is shut before the service is asked.
    it('refuses a creator whose contract ended with 403, saving nothing', async () => {
      await bayu.client.post('/me/contents/proposals').send(body()).expect(403);

      expect(await count(bayu.creatorId)).toBe(0);
    });

    it('asks for a session', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer()).post('/me/contents/proposals').send(body()).expect(401);
    });

    // OWASP Top 10:2025 A01: the owner and the status come from the session and the server.
    it('ignores a creator, a contract and a status in the body', async () => {
      const res = await dina.client
        .post('/me/contents/proposals')
        .send({ ...body(30, { name: 'Satu' }), creatorId: rani.creatorId, contractId: rani.contractIds[0], status: 'scheduled' })
        .expect(201);

      const saved = await prisma.contents.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(saved).toMatchObject({ contract_id: dina.contractIds[0], status: 'pending' });
    });
  });

  describe('while it is pending (AC 5, 6)', () => {
    let proposalId: string;

    beforeAll(async () => {
      const res = await rani.client.post('/me/contents/proposals').send(body(25, { name: 'Menunggu Persetujuan' }));
      proposalId = res.body.id;
    });

    it('shows under Menunggu Admin and Semua, never Perlu Dikerjakan, with only "Batalkan Pengajuan"', async () => {
      const waiting = await rani.client.get('/me/contents?tab=waiting_admin').expect(200);
      const todo = await rani.client.get('/me/contents?tab=to_do').expect(200);
      const all = await rani.client.get('/me/contents').expect(200);

      const row = waiting.body.items.find((item: { id: string }) => item.id === proposalId);
      expect(row).toMatchObject({
        status: 'pending',
        type: 'specific',
        actions: ['cancel_proposal'],
        tags: [],
      });
      expect(todo.body.items.map((item: { id: string }) => item.id)).not.toContain(proposalId);
      expect(all.body.items.map((item: { id: string }) => item.id)).toContain(proposalId);
      expect(waiting.body.tabCounts.waiting_admin).toBeGreaterThanOrEqual(1);
    });

    it('opens in Content Detail with its first step by the creator, and no draft or link to send', async () => {
      const detail = await rani.client.get(`/me/contents/${proposalId}`).expect(200);

      expect(detail.body).toMatchObject({ status: 'pending', waitingOn: 'admin', creatorActions: [] });
      expect(detail.body.events[0]).toMatchObject({ type: 'scheduled', actor: { role: 'creator' } });
      // A proposal nobody accepted reads as missing to the hand-in routes, so no draft or link can
      // be sent for it (AC 5).
      await rani.client
        .post(`/contents/${proposalId}/draft`)
        .send({ link: 'https://drive.google.com/x', notes: '' })
        .expect(404);
      await rani.client
        .post(`/contents/${proposalId}/video`)
        .send({ link: 'https://www.instagram.com/reel/abc/' })
        .expect(404);
    });

    // AC 6. A pending proposal whose deadline reaches H-1 is scheduled by the system (exists), so
    // there is no pending one past its deadline to be penalised; what is checked is that a live
    // one changes neither the invoice nor the quota.
    it('is not counted toward the quota and not in the invoice', async () => {
      const read = async () => {
        const invoice = await admin.get(`/invoices/${rani.creatorId}`).expect(200);
        const detail = await admin.get(`/creators/${rani.creatorId}`).expect(200);
        return {
          components: invoice.body.components,
          total: invoice.body.total,
          quota: detail.body.contractHistory.map((p: { remainingEvergreenQuota: number }) => p.remainingEvergreenQuota),
          progress: detail.body.progress,
        };
      };
      const before = await read();

      const made = await rani.client.post('/me/contents/proposals').send(body(50, { name: 'Tidak Dihitung' })).expect(201);

      const after = await read();
      expect(after).toEqual(before);
      for (const key of ['additionalContent', 'performanceBonus', 'penalty']) {
        const lines = after.components[key].lines as { contentId: string }[];
        expect(lines.map((line) => line.contentId)).not.toContain(made.body.id);
      }
    });
  });

  describe('withdrawing (AC 5)', () => {
    it('removes the creator’s own pending proposal, once', async () => {
      const made = await rani.client.post('/me/contents/proposals').send(body(30, { name: 'Dibatalkan' }));

      const gone = await rani.client.delete(`/me/contents/proposals/${made.body.id}`).expect(200);

      expect(gone.body).toEqual({ id: made.body.id, removed: true });
      expect(await prisma.contents.findUnique({ where: { id: made.body.id } })).toBeNull();
      await rani.client.delete(`/me/contents/proposals/${made.body.id}`).expect(404);
    });

    // OWASP Top 10:2025 A01: another creator's content answers as a missing one.
    it('answers 404 for another creator’s proposal, leaving it be', async () => {
      const mine = await dina.client.post('/me/contents/proposals').send(body(35, { name: 'Punya Dina' }));

      await rani.client.delete(`/me/contents/proposals/${mine.body.id}`).expect(404);

      expect(await prisma.contents.findUnique({ where: { id: mine.body.id } })).not.toBeNull();
    });

    it('answers 409 once the admin approved it, and the content stays scheduled', async () => {
      const made = await rani.client.post('/me/contents/proposals').send(body(40, { name: 'Disetujui' }));
      await admin.patch(`/contents/${made.body.id}/proposal/approve`).expect(200);

      const res = await rani.client.delete(`/me/contents/proposals/${made.body.id}`).expect(409);

      expect(res.body.code).toBe('PROPOSAL_NOT_PENDING');
      expect(await prisma.contents.findUniqueOrThrow({ where: { id: made.body.id } })).toMatchObject({
        status: 'scheduled',
      });
    });

    // OWASP Top 10:2025 A06 (Insecure Design): of a withdrawal and an approval at once, one wins.
    it('lets only one of a withdrawal and an approval at once change the proposal', async () => {
      const made = await rani.client.post('/me/contents/proposals').send(body(45, { name: 'Balapan' }));

      const answers = await Promise.all([
        rani.client.delete(`/me/contents/proposals/${made.body.id}`),
        admin.patch(`/contents/${made.body.id}/proposal/approve`),
      ]);

      const remaining = await prisma.contents.findUnique({ where: { id: made.body.id } });
      // Withdrawn first: gone, and the approval says so. Approved first: kept, and the
      // withdrawal says it is no longer pending. Never both succeeding, never a pending leftover.
      expect(remaining === null || remaining.status === 'scheduled').toBe(true);
      expect(answers.filter((answer) => answer.status === 200)).toHaveLength(1);
    });

    it('answers 400 for an id that is not a UUID', async () => {
      await rani.client.delete('/me/contents/proposals/not-a-uuid').expect(400);
    });
  });
});
