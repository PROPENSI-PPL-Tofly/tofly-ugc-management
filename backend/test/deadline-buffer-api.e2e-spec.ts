import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { readableDay } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signIn } from './sessions.js';

// SCRUM-298 (PBI-23 AC 20-24) over HTTP against the real app and schema: who may read and change
// the deadline buffer, what a save records, and that Tambah Konten and content edit follow the
// stored value while nothing already scheduled moves. The buffer is global, so the suite puts back
// the value it found; its buffer_changed entries stay, as Log Aktivitas can only be added to.

const MARKER = 'e2e-deadline-buffer-api';
const email = (name: string) => `${MARKER}-${name}@example.com`;
const iso = (offset: number) => day(offset).toISOString().slice(0, 10);

describe('Deadline buffer API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: string;
  let admin: string;
  let creator: string;
  let original: number;
  let contractId: string;

  async function adminSession(name: string, role: 'admin' | 'super_admin') {
    const user = await prisma.users.create({
      data: { email: email(name), is_admin: true, admin_role: role },
    });
    return {
      id: user.id,
      cookie: await signIn(app, { userId: user.id, role: 'admin' }),
    };
  }

  const stored = async () =>
    (await prisma.deadline_buffer.findUniqueOrThrow({ where: { id: true } }))
      .buffer_days;

  const entriesBy = (actorName: string) =>
    prisma.audit_logs.findMany({
      where: { action: 'buffer_changed', actor_name: actorName },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      select: {
        actor_role: true,
        category: true,
        target_label: true,
        old_values: true,
        new_values: true,
      },
    });

  async function cleanUp() {
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
  }

  beforeAll(async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', '');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    await cleanUp();
    original = await stored();

    ({ cookie: superAdmin } = await adminSession('super-admin', 'super_admin'));
    ({ cookie: admin } = await adminSession('admin', 'admin'));
    const user = await prisma.users.create({
      data: {
        email: email('creator'),
        creators: {
          create: {
            first_name: MARKER,
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
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    contractId = user.creators!.contracts[0].id;
    creator = await signIn(app, {
      userId: user.id,
      role: 'creator',
      creatorId: user.creators!.id,
    });
  });

  afterAll(async () => {
    // Back to the value the suite found, through the API so the trail stays whole.
    await as(app, superAdmin)
      .put('/deadline-buffer')
      .send({ bufferDays: original });
    await cleanUp();
    await app.close();
    vi.unstubAllEnvs();
  });

  // OWASP A01:2025: every signed-in form reads the buffer (AC 24); only a Super Admin changes it.
  describe('access', () => {
    it('answers 401 to a read without a session', async () => {
      expect(
        (await request(app.getHttpServer()).get('/deadline-buffer')).status,
      ).toBe(401);
    });

    it.each([
      ['an Admin', () => admin],
      ['a creator', () => creator],
      ['a Super Admin', () => superAdmin],
    ])('lets %s read the buffer and its range', async (_who, cookie) => {
      const response = await as(app, cookie()).get('/deadline-buffer');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        bufferDays: await stored(),
        min: 1,
        max: 14,
      });
    });

    // From the app's own origin, so the session is what is missing (a write from nowhere is
    // already refused by the same-origin check, below).
    it('answers 401 to a change without a session', async () => {
      const response = await request(app.getHttpServer())
        .put('/deadline-buffer')
        .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:3000')
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ bufferDays: 6 });

      expect(response.status).toBe(401);
    });

    it.each([
      ['an Admin', () => admin],
      ['a creator', () => creator],
    ])(
      'answers 403 to %s changing the buffer, changing nothing',
      async (_who, cookie) => {
        const before = await stored();

        const response = await as(app, cookie())
          .put('/deadline-buffer')
          .send({ bufferDays: 6 });

        expect(response.status).toBe(403);
        expect(await stored()).toBe(before);
      },
    );

    it('refuses a change from another site, even with a Super Admin session', async () => {
      const response = await request(app.getHttpServer())
        .put('/deadline-buffer')
        .set('Cookie', superAdmin)
        .set('Origin', 'https://evil.example')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ bufferDays: 6 });

      expect(response.status).toBe(403);
    });

    it('refuses a Super Admin on the next request once made an Admin', async () => {
      const demoted = await adminSession('demoted', 'super_admin');
      await prisma.users.update({
        where: { id: demoted.id },
        data: { admin_role: 'admin' },
      });

      const response = await as(app, demoted.cookie)
        .put('/deadline-buffer')
        .send({ bufferDays: 6 });

      expect(response.status).toBe(403);
    });
  });

  // OWASP A02:2025: a form never validates with a buffer a cache kept.
  it('tells every cache not to keep the buffer', async () => {
    const read = await as(app, admin).get('/deadline-buffer');
    const saved = await as(app, superAdmin)
      .put('/deadline-buffer')
      .send({ bufferDays: original });

    expect(read.headers['cache-control']).toBe('no-store');
    expect(saved.headers['cache-control']).toBe('no-store');
  });

  // OWASP A05:2025, A06:2025: only a whole number from 1 to 14 is ever stored.
  it.each([
    { bufferDays: '7' },
    { bufferDays: 0 },
    { bufferDays: 15 },
    { bufferDays: 7, id: false },
  ])('answers 422 to %j, storing nothing', async (body) => {
    const before = await stored();

    const response = await as(app, superAdmin)
      .put('/deadline-buffer')
      .send(body);

    expect(response.status).toBe(422);
    expect(await stored()).toBe(before);
  });

  // OWASP A09:2025: each change is one buffer_changed entry under Pengaturan, with numbers.
  it('records a change once, with the Super Admin and both values, and a repeat save not at all', async () => {
    const changeTo = original === 7 ? 8 : 7;
    const actor = email('super-admin');
    // Entries are permanent, and earlier runs used the same test Super Admin: count only new ones.
    const before = (await entriesBy(actor)).length;

    const saved = await as(app, superAdmin)
      .put('/deadline-buffer')
      .send({ bufferDays: changeTo });
    await as(app, superAdmin)
      .put('/deadline-buffer')
      .send({ bufferDays: changeTo });

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ bufferDays: changeTo, min: 1, max: 14 });
    expect(await stored()).toBe(changeTo);
    const added = (await entriesBy(actor)).slice(before);
    expect(added).toEqual([
      {
        actor_role: 'super_admin',
        category: 'pengaturan',
        target_label: 'Buffer Deadline',
        old_values: { bufferDays: expect.any(Number) },
        new_values: { bufferDays: changeTo },
      },
    ]);
  });

  // PBI-23 AC 22-23: the stored buffer draws both lines of Tambah Konten, and a larger buffer never
  // moves or blocks what was already scheduled ("Jadwal yang sudah ada tidak berubah").
  describe('with a larger buffer stored', () => {
    let existingId: string;

    beforeAll(async () => {
      // Scheduled under the default 5 days: the last day H-5 allowed.
      const existing = await prisma.contents.create({
        data: {
          contract_id: contractId,
          type: 'specific',
          name: `${MARKER} Existing`,
          brief: 'Brief',
          deadline: day(55),
          status: 'scheduled',
        },
      });
      existingId = existing.id;
      await as(app, superAdmin).put('/deadline-buffer').send({ bufferDays: 9 });
    });

    it('refuses a new content past the H-9 line and takes the H-9 day itself', async () => {
      const add = (deadline: string) =>
        as(app, admin)
          .post('/contents')
          .send({
            contractId,
            type: 'specific',
            name: `${MARKER} Tambah ${deadline}`,
            brief: 'Brief',
            deadline,
          });

      const late = await add(iso(52));
      const onTheLine = await add(iso(51));

      expect(late.status).toBe(422);
      expect(late.body.errors.deadline).toBe(
        `Deadline paling lambat ${readableDay(iso(51))} (H-9 akhir kontrak)`,
      );
      expect(onTheLine.status).toBe(201);
    });

    it('leaves the existing deadline where it was and still edits its other fields', async () => {
      const response = await as(app, admin)
        .patch(`/contents/${existingId}`)
        .send({ brief: 'Brief baru' });

      expect(response.status).toBe(200);
      const row = await prisma.contents.findUniqueOrThrow({
        where: { id: existingId },
      });
      expect(row.deadline.toISOString().slice(0, 10)).toBe(iso(55));
      expect(row.brief).toBe('Brief baru');
    });

    it('draws the admin edit window with the stored buffer', async () => {
      const detail = await as(app, admin).get(`/contents/${existingId}`);

      expect(detail.body.edit).toEqual({
        earliestDeadline: iso(9),
        latestDeadline: iso(51),
      });
    });
  });
});
