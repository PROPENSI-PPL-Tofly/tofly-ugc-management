import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const API_ROLES = ['anon', 'authenticated'] as const;

/**
 * `anon` and `authenticated` are the Data API roles of the hosted Postgres the schema started
 * on, and the early migrations still name them (prisma/ops/bootstrap-roles.sql creates them,
 * closed, wherever they are missing). Tofly reads and writes only through the backend, so
 * neither role may touch a table: an open `users` lets anyone make themselves an admin, and
 * `social_accounts` holds creators' platform tokens.
 */
describe('Tofly tables from the API roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tables: string[];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    tables = (
      await prisma.$queryRaw<{ tablename: string }[]>`
        select tablename from pg_tables where schemaname = 'public' order by tablename`
    ).map((row) => row.tablename);
  });

  afterAll(async () => {
    await app.close();
  });

  /** What each API role may do to each table, per Postgres itself. */
  async function privileges() {
    return prisma.$queryRaw<
      { role: string; tablename: string; granted: boolean }[]
    >`
      select r.role, t.tablename,
             has_table_privilege(r.role, format('public.%I', t.tablename),
                                 'select, insert, update, delete') as granted
      from pg_tables t
      cross join unnest(array['anon', 'authenticated']) as r(role)
      where t.schemaname = 'public'`;
  }

  it('covers every table the migrations create', () => {
    expect(tables).toEqual(
      expect.arrayContaining([
        'app_sessions',
        'contents',
        'contracts',
        'creators',
        'social_accounts',
        'submissions',
        'users',
      ]),
    );
  });

  it('grants neither API role any access to any table', async () => {
    const open = (await privileges()).filter((row) => row.granted);

    expect(open).toEqual([]);
  });

  it('keeps row-level security on for every table, so a stray grant still sees no rows', async () => {
    const withoutRls = await prisma.$queryRaw<{ relname: string }[]>`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;

    expect(withoutRls).toEqual([]);
  });

  // Default privileges could hand the API roles every table a later migration adds. The table is
  // made as the role that runs migrations (MIGRATOR_DB_URL in CI; locally the app's own
  // `postgres`): the app role itself may not create tables.
  it.each(API_ROLES)(
    'gives %s nothing on a table created by a later migration',
    async (role) => {
      const migrator = new PrismaClient({
        datasourceUrl: process.env.MIGRATOR_DB_URL ?? process.env.DATABASE_URL,
      });
      const granted = await migrator
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'create table public.e2e_future_table (id int)',
          );
          const [row] = await tx.$queryRawUnsafe<{ granted: boolean }[]>(
            `select has_table_privilege('${role}', 'public.e2e_future_table', 'select, insert') as granted`,
          );
          throw Object.assign(new Error('rollback'), { granted: row.granted });
        })
        .catch((error: Error & { granted?: boolean }) => error.granted)
        .finally(() => migrator.$disconnect());

      expect(granted).toBe(false);
    },
  );
});
