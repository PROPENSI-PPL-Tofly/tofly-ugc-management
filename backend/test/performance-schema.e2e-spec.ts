import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

// The performance columns content_links carries for PBI-27 (27.1), read from the real schema.
// 27.4's sync writes these columns and imports the enum by name, so the names, the values and
// their order are a contract, not a detail.

/** Thrown to undo a transaction once what it showed has been read. */
class Rollback extends Error {}

interface ColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

describe('content_links performance schema (e2e)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function columns(): Promise<Map<string, ColumnRow>> {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'content_links'
    `;
    return new Map(rows.map((row) => [row.column_name, row]));
  }

  /**
   * Runs `work` against one freshly linked content inside a transaction that is always rolled
   * back, so no row outlives the test.
   */
  async function withLink<T>(
    work: (tx: Prisma.TransactionClient, linkId: string) => Promise<T>,
  ): Promise<T> {
    let result!: T;
    await prisma
      .$transaction(async (tx) => {
        const user = await tx.users.create({
          data: { email: `perf-schema-${randomUUID()}@example.com` },
        });
        const creator = await tx.creators.create({
          data: { user_id: user.id, first_name: 'Schema' },
        });
        const contract = await tx.contracts.create({
          data: {
            creator_id: creator.id,
            start_date: new Date('2026-09-01Z'),
            end_date: new Date('2026-12-31Z'),
            content_quota: 1,
            days_between: 7,
            fixed_rate: 0,
            contract_type: 'regular',
          },
        });
        const content = await tx.contents.create({
          data: {
            contract_id: contract.id,
            name: 'perf-schema',
            type: 'evergreen',
            deadline: new Date('2026-09-10Z'),
            status: 'link_submitted',
            video_submitted_at: new Date('2026-09-09Z'),
          },
        });
        const url = `https://www.instagram.com/reel/${randomUUID().slice(0, 11)}/`;
        const [link] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO content_links (content_id, platform, url, normalized_url, submitted_at, submitted_by)
          VALUES (${content.id}::uuid, 'instagram', ${url}, content_link_key(${url}), '2026-09-09', ${user.id}::uuid)
          RETURNING id
        `;
        result = await work(tx, link.id);
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    return result;
  }

  it('names the link_data_state enum with its six values in order', async () => {
    const rows = await prisma.$queryRaw<{ value: string }[]>`
      SELECT e.enumlabel AS value
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'link_data_state'
      ORDER BY e.enumsortorder
    `;

    expect(rows.map((row) => row.value)).toEqual([
      'waiting',
      'not_connected',
      'synced',
      'not_found',
      'sync_failed',
      'manual',
    ]);
  });

  it('keeps views, likes, comments and shares as nullable integers, with no default', async () => {
    const found = await columns();

    for (const name of ['views', 'likes', 'comments', 'shares']) {
      expect(found.get(name), name).toMatchObject({
        data_type: 'integer',
        is_nullable: 'YES',
        column_default: null,
      });
    }
  });

  it('keeps a required data_state of link_data_state that starts as waiting, and a nullable last_synced_at', async () => {
    const found = await columns();

    expect(found.get('data_state')).toMatchObject({
      udt_name: 'link_data_state',
      is_nullable: 'NO',
      column_default: "'waiting'::link_data_state",
    });
    expect(found.get('last_synced_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'YES',
    });
  });

  it('reads a new link as waiting with no number at all, never 0', async () => {
    const row = await withLink(async (tx, id) => {
      const [stored] = await tx.$queryRaw<Record<string, unknown>[]>`
        SELECT views, likes, comments, shares, data_state::text AS data_state, last_synced_at
        FROM content_links WHERE id = ${id}::uuid
      `;
      return stored;
    });

    expect(row).toEqual({
      views: null,
      likes: null,
      comments: null,
      shares: null,
      data_state: 'waiting',
      last_synced_at: null,
    });
  });

  it('keeps manual_by and manual_at nullable, with manual_by naming a user', async () => {
    const found = await columns();

    expect(found.get('manual_by')).toMatchObject({
      udt_name: 'uuid',
      is_nullable: 'YES',
    });
    expect(found.get('manual_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'YES',
    });
    await expect(
      withLink(
        (tx, id) =>
          tx.$executeRaw`
          UPDATE content_links SET manual_by = ${randomUUID()}::uuid, manual_at = now()
          WHERE id = ${id}::uuid
        `,
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('stores who typed numbers in and when together, or neither', async () => {
    const stamped = await withLink(async (tx, id) => {
      const [admin] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO users (email) VALUES (${`perf-admin-${randomUUID()}@example.com`})
        RETURNING id
      `;
      return tx.$executeRaw`
        UPDATE content_links SET manual_by = ${admin.id}::uuid, manual_at = now()
        WHERE id = ${id}::uuid
      `;
    });
    expect(stamped).toBe(1);

    await expect(
      withLink(
        (tx, id) =>
          tx.$executeRaw`UPDATE content_links SET manual_at = now() WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/content_links_manual_check/);
    await expect(
      withLink(async (tx, id) => {
        const [admin] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO users (email) VALUES (${`perf-admin-${randomUUID()}@example.com`})
          RETURNING id
        `;
        return tx.$executeRaw`
          UPDATE content_links SET manual_by = ${admin.id}::uuid WHERE id = ${id}::uuid
        `;
      }),
    ).rejects.toThrow(/content_links_manual_check/);
  });

  it('accepts Performance Entered in the content timeline and still refuses an unknown kind', async () => {
    async function record(eventType: string) {
      return withLink(async (tx, id) => {
        const [link] = await tx.$queryRaw<{ content_id: string }[]>`
          SELECT content_id FROM content_links WHERE id = ${id}::uuid
        `;
        return tx.$executeRaw`
          INSERT INTO content_events (content_id, event_type, actor_name, actor_role, event_data)
          VALUES (${link.content_id}::uuid, ${eventType}, 'Admin', 'admin', '{"platform":"instagram"}'::jsonb)
        `;
      });
    }

    await expect(record('Performance Entered')).resolves.toBe(1);
    await expect(record('Performance Guessed')).rejects.toThrow(
      /content_events_event_type_check/,
    );
  });

  it('stores a real 0 and refuses a negative number in any metric', async () => {
    const zero = await withLink(async (tx, id) => {
      const [stored] = await tx.$queryRaw<Record<string, number>[]>`
        UPDATE content_links SET views = 0, likes = 0, comments = 0, shares = 0
        WHERE id = ${id}::uuid RETURNING views, likes, comments, shares
      `;
      return stored;
    });
    expect(zero).toEqual({ views: 0, likes: 0, comments: 0, shares: 0 });

    for (const metric of ['views', 'likes', 'comments', 'shares']) {
      await expect(
        withLink((tx, id) =>
          tx.$executeRawUnsafe(
            `UPDATE content_links SET ${metric} = -1 WHERE id = $1::uuid`,
            id,
          ),
        ),
        metric,
      ).rejects.toThrow(/content_links_metrics_check/);
    }
  });
});
