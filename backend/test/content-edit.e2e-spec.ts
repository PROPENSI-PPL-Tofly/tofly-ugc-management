import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { latestDeadline, readableDay } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';
import { day } from './days.js';

// Rows created here carry this marker so the cleanup never touches anything else.
const MARKER = 'e2e-content-edit';

const iso = (offset: number) => day(offset).toISOString().slice(0, 10);

describe('PATCH and DELETE /contents/:id (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creator: ReturnType<typeof as>;
  let contractId: string;

  /** A creator with one contract of two Evergreen slots, ending 60 days from today. */
  async function creatorWithContract(name: string) {
    const user = await prisma.users.create({
      data: { email: `${MARKER}-${name}@example.com` },
    });
    const saved = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: MARKER,
        last_name: name,
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(60),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 2,
            fixed_rate: 100000,
          },
        },
      },
      select: { id: true, contracts: { select: { id: true } } },
    });
    return {
      userId: user.id,
      creatorId: saved.id,
      contractId: saved.contracts[0].id,
    };
  }

  function scheduled(
    name: string,
    overrides: {
      type?: 'evergreen' | 'specific';
      contract?: string;
      deadline?: number;
    } = {},
  ) {
    return prisma.contents.create({
      data: {
        contract_id: overrides.contract ?? contractId,
        type: overrides.type ?? 'specific',
        name,
        brief: overrides.type === 'evergreen' ? '' : `Brief ${name}`,
        deadline: day(overrides.deadline ?? 20),
        status: 'scheduled',
      },
    });
  }

  function eventsOf(contentId: string) {
    return prisma.content_events.findMany({
      where: { content_id: contentId },
      select: { event_type: true, actor_role: true, event_data: true },
    });
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));

    const owner = await creatorWithContract('rangga');
    contractId = owner.contractId;
    creator = as(
      app,
      await signIn(app, {
        userId: owner.userId,
        role: 'creator',
        creatorId: owner.creatorId,
      }),
    );
  });

  afterAll(async () => {
    // Deleting a creator cascades to its contract, invoice and contents; users go separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  describe('PATCH /contents/:id', () => {
    it('changes a Specific item and records old and new values in the timeline (AC 2, 4)', async () => {
      const item = await scheduled(`${MARKER} Promo`);

      const response = await admin
        .patch(`/contents/${item.id}`)
        .send({
          deadline: iso(25),
          brief: 'Brief baru',
          name: `${MARKER} Promo Akhir Tahun`,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: item.id,
        contractId,
        type: 'specific',
        name: `${MARKER} Promo Akhir Tahun`,
        brief: 'Brief baru',
        deadline: iso(25),
        status: 'scheduled',
      });
      expect(await eventsOf(item.id)).toEqual([
        {
          event_type: 'Content Updated',
          actor_role: 'admin',
          event_data: {
            changes: {
              deadline: { from: iso(20), to: iso(25) },
              brief: { from: `Brief ${MARKER} Promo`, to: 'Brief baru' },
              name: {
                from: `${MARKER} Promo`,
                to: `${MARKER} Promo Akhir Tahun`,
              },
            },
          },
        },
      ]);
    });

    it('shows the creator the new deadline in Task Saya right away (AC 5)', async () => {
      const item = await scheduled(`${MARKER} Deadline baru`);
      await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: iso(30) })
        .expect(200);

      const { body } = await creator
        .get('/me/contents')
        .query({ pageSize: 50 })
        .expect(200);

      const row = (body.items as { id: string; deadline: string }[]).find(
        (task) => task.id === item.id,
      );
      expect(row?.deadline).toBe(iso(30));
    });

    it('renames an Evergreen item after its new deadline, keeping its sequence', async () => {
      const item = await scheduled(
        `Evg_2_${MARKER} rangga_${iso(20).split('-').reverse().join('')}`,
        { type: 'evergreen' },
      );

      const { body } = await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: iso(22) })
        .expect(200);

      expect(body.name).toBe(
        `Evg_2_${MARKER} rangga_${iso(22).split('-').reverse().join('')}`,
      );
    });

    it('refuses a deadline past the H-5 line or inside the buffer, changing nothing (AC 3)', async () => {
      const item = await scheduled(`${MARKER} Batas`);
      const lastDay = latestDeadline(iso(60));

      const late = await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: iso(56) });
      const early = await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: iso(4) });

      expect(late.status).toBe(422);
      expect(late.body.errors).toEqual({
        deadline: `Deadline paling lambat ${readableDay(lastDay)} (H-5 akhir kontrak)`,
      });
      expect(early.status).toBe(422);
      expect(early.body.errors).toEqual({
        deadline: `Deadline paling cepat ${readableDay(iso(5))}`,
      });
      await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: lastDay })
        .expect(200);
      expect(await eventsOf(item.id)).toHaveLength(1);
    });

    it('refuses renaming an Evergreen item', async () => {
      const item = await scheduled(`Evg_1_${MARKER}_01012027`, {
        type: 'evergreen',
      });

      const response = await admin
        .patch(`/contents/${item.id}`)
        .send({ name: 'Nama sendiri' });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual({
        name: 'Nama konten Evergreen dibuat otomatis dan tidak bisa diubah',
      });
    });
  });

  describe('DELETE /contents/:id', () => {
    it('deletes the item for good, so no list or count holds it anymore (AC 8)', async () => {
      const item = await scheduled(`${MARKER} Hapus`);
      await admin
        .patch(`/contents/${item.id}`)
        .send({ brief: 'Sempat diubah' })
        .expect(200);

      const response = await admin.delete(`/contents/${item.id}`);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect(
        await prisma.contents.findUnique({ where: { id: item.id } }),
      ).toBeNull();
      expect(await eventsOf(item.id)).toEqual([]);
      await admin.get(`/contents/${item.id}`).expect(404);

      const list = await admin
        .get('/contents')
        .query({ contract: contractId, pageSize: 50 });
      expect(
        (list.body.items as { id: string }[]).map((row) => row.id),
      ).not.toContain(item.id);
      const tasks = await creator.get('/me/contents').query({ pageSize: 50 });
      expect(
        (tasks.body.items as { id: string }[]).map((row) => row.id),
      ).not.toContain(item.id);
    });

    it('frees the Evergreen slot, so Tambah Konten can schedule one again (AC 7)', async () => {
      const own = await creatorWithContract('quota');
      const first = await scheduled(`Evg_1_${MARKER}`, {
        type: 'evergreen',
        contract: own.contractId,
      });
      await scheduled(`Evg_2_${MARKER}`, {
        type: 'evergreen',
        contract: own.contractId,
      });
      const add = () =>
        admin.post('/contents').send({
          contractId: own.contractId,
          type: 'evergreen',
          deadline: iso(30),
        });

      const full = await add();
      expect(full.status).toBe(422);
      expect(full.body.errors).toEqual({ type: 'Slot Evergreen sudah penuh' });

      await admin.delete(`/contents/${first.id}`).expect(204);

      await add().expect(201);
    });
  });

  describe('guards (AC 1, 9)', () => {
    it('refuses both once a draft is handed in, and changes nothing', async () => {
      const item = await scheduled(`${MARKER} Ada draft`);
      await creator
        .post(`/contents/${item.id}/draft`)
        .send({ link: 'https://drive.google.com/file/d/e2e-content-edit' })
        .expect(201);

      const edit = await admin
        .patch(`/contents/${item.id}`)
        .send({ brief: 'Terlambat' });
      const remove = await admin.delete(`/contents/${item.id}`);

      for (const answer of [edit, remove]) {
        expect(answer.status).toBe(409);
        expect(answer.body).toEqual({
          code: 'CONTENT_NOT_EDITABLE',
          message:
            'Konten hanya bisa diubah atau dihapus selama berstatus Scheduled dan belum ada draft',
        });
      }
      const after = await prisma.contents.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(after.brief).toBe(`Brief ${MARKER} Ada draft`);
    });

    it('refuses both once the contract invoice is finalized', async () => {
      const frozen = await creatorWithContract('frozen');
      const item = await scheduled(`${MARKER} Beku`, {
        contract: frozen.contractId,
      });
      await prisma.invoices.create({
        data: {
          contract_id: frozen.contractId,
          status: 'finalized',
          finalized_at: new Date(),
          snapshot: {},
        },
      });

      const edit = await admin
        .patch(`/contents/${item.id}`)
        .send({ brief: 'Terlambat' });
      const remove = await admin.delete(`/contents/${item.id}`);

      for (const answer of [edit, remove]) {
        expect(answer.status).toBe(409);
        expect(answer.body.code).toBe('INVOICE_FINALIZED');
      }
      expect(
        await prisma.contents.findUnique({ where: { id: item.id } }),
      ).not.toBeNull();
    });

    it('lets no creator edit or delete, not even their own content', async () => {
      const item = await scheduled(`${MARKER} Milik creator`);

      const edit = await creator
        .patch(`/contents/${item.id}`)
        .send({ brief: 'x' });
      const remove = await creator.delete(`/contents/${item.id}`);

      expect(edit.status).toBe(403);
      expect(remove.status).toBe(403);
      expect(
        await prisma.contents.findUnique({ where: { id: item.id } }),
      ).not.toBeNull();
    });

    it('answers 404 for an unknown content and 400 for a malformed id', async () => {
      const unknown = '99999999-9999-4999-8999-999999999999';

      await admin
        .patch(`/contents/${unknown}`)
        .send({ brief: 'x' })
        .expect(404);
      await admin.delete(`/contents/${unknown}`).expect(404);
      await admin.delete('/contents/not-a-uuid').expect(400);
    });
  });
});
