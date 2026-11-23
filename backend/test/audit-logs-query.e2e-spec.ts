import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  AboutCreators,
  ActedBy,
  allOf,
  InCategories,
  OccurredBetween,
  WithActions,
  type AuditLogSpec,
} from '../src/audit-logs/audit-log-specs.js';
import { AuditLogsService } from '../src/audit-logs/audit-logs.service.js';

// SCRUM-296 against the real schema: the specifications and the service's reads, run by Postgres.
// audit_logs rows can never be deleted, so every case adds its rows inside a transaction it rolls
// back, and narrows to a creator id of its own so other data cannot reach its exact counts.

class RolledBack extends Error {}

describe('Log Aktivitas reads (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function inRollback(
    work: (
      tx: Prisma.TransactionClient,
      service: AuditLogsService,
    ) => Promise<void>,
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        await work(tx, new AuditLogsService(tx as never));
        throw new RolledBack();
      });
    } catch (error) {
      if (!(error instanceof RolledBack)) throw error;
    }
  }

  function entry(
    creatorId: string,
    data: Partial<Prisma.audit_logsUncheckedCreateInput> = {},
  ): Prisma.audit_logsUncheckedCreateInput {
    return {
      actor_name: 'Sistem',
      actor_role: 'system',
      category: 'pengaturan',
      action: 'rate_formula_changed',
      target_type: 'rate_formula',
      target_label: 'Formula Rate',
      creator_id: creatorId,
      ...data,
    };
  }

  const ids = (list: { items: { targetLabel: string }[] }) =>
    list.items.map((item) => item.targetLabel);

  async function listed(
    service: AuditLogsService,
    creatorId: string,
    specs: AuditLogSpec[] = [],
    page = 1,
  ) {
    return service.list({
      page,
      filter: allOf([new AboutCreators([creatorId]), ...specs]),
    });
  }

  it('takes both days of a range whole, in WIB', async () => {
    await inRollback(async (tx, service) => {
      const creatorId = randomUUID();
      await tx.audit_logs.createMany({
        data: [
          ['before', '2026-10-31T16:59:59.999Z'],
          ['first', '2026-10-31T17:00:00.000Z'],
          ['last', '2026-11-03T16:59:59.999Z'],
          ['after', '2026-11-03T17:00:00.000Z'],
        ].map(([target_label, at]) =>
          entry(creatorId, { target_label, occurred_at: new Date(at) }),
        ),
      });

      const list = await listed(service, creatorId, [
        new OccurredBetween('2026-11-01', '2026-11-03'),
      ]);

      expect(ids(list)).toEqual(['last', 'first']);
    });
  });

  it('reads "Sistem" as the entries with no user, beside chosen people', async () => {
    await inRollback(async (tx, service) => {
      const creatorId = randomUUID();
      const admin = randomUUID();
      const other = randomUUID();
      await tx.audit_logs.createMany({
        data: [
          entry(creatorId, { target_label: 'system' }),
          entry(creatorId, {
            target_label: 'admin',
            actor_user_id: admin,
            actor_name: 'Bimo',
            actor_role: 'admin',
          }),
          entry(creatorId, {
            target_label: 'other',
            actor_user_id: other,
            actor_name: 'Rina',
            actor_role: 'super_admin',
          }),
        ],
      });

      const system = await listed(service, creatorId, [
        new ActedBy(['system']),
      ]);
      const both = await listed(service, creatorId, [
        new ActedBy([admin, 'system']),
      ]);

      expect(ids(system)).toEqual(['system']);
      expect(ids(both).sort()).toEqual(['admin', 'system']);
    });
  });

  it('requires the category and the action together', async () => {
    await inRollback(async (tx, service) => {
      const creatorId = randomUUID();
      await tx.audit_logs.createMany({
        data: [
          entry(creatorId, { target_label: 'formula' }),
          entry(creatorId, {
            target_label: 'finalized',
            category: 'invoice_pembayaran',
            action: 'invoice_finalized',
            target_type: 'invoice',
          }),
        ],
      });

      const matching = await listed(service, creatorId, [
        new InCategories(['invoice_pembayaran']),
        new WithActions(['invoice_finalized']),
      ]);
      const crossed = await listed(service, creatorId, [
        new InCategories(['pengaturan']),
        new WithActions(['invoice_finalized']),
      ]);

      expect(ids(matching)).toEqual(['finalized']);
      expect(crossed.total).toBe(0);
    });
  });

  it('pages 20 newest first, the id ordering one moment, and reads a page past the end as the last', async () => {
    await inRollback(async (tx, service) => {
      const creatorId = randomUUID();
      const at = new Date('2026-11-01T03:00:00.000Z');
      await tx.audit_logs.createMany({
        data: Array.from({ length: 21 }, (_, index) =>
          entry(creatorId, {
            target_label: String(index),
            occurred_at: index === 0 ? new Date('2026-10-01T00:00:00Z') : at,
          }),
        ),
      });

      const first = await listed(service, creatorId);
      const past = await listed(service, creatorId, [], 9);

      expect(first).toMatchObject({ page: 1, total: 21, totalPages: 2 });
      expect(first.items).toHaveLength(20);
      const sameMoment = first.items.map((item) => item.id);
      expect(sameMoment).toEqual([...sameMoment].sort().reverse());
      expect(past.page).toBe(2);
      expect(ids(past)).toEqual(['0']);
    });
  });

  it('names a creator on record, and none once the id matches no creator', async () => {
    await inRollback(async (tx, service) => {
      const user = await tx.users.create({
        data: {
          email: `e2e-audit-logs-query-${randomUUID()}@example.com`,
          creators: {
            create: { first_name: 'Nadia', last_name: 'Putri' },
          },
        },
        include: { creators: true },
      });
      const creatorId = user.creators!.id;
      const goneId = randomUUID();
      await tx.audit_logs.createMany({
        data: [entry(creatorId), entry(goneId)],
      });

      const [named] = (await listed(service, creatorId)).items;
      const [gone] = (await listed(service, goneId)).items;
      const { creators } = await service.filterOptions();

      expect(named.creator).toEqual({ id: creatorId, name: 'Nadia Putri' });
      expect(gone.creator).toBeNull();
      expect(creators).toContainEqual({
        value: creatorId,
        label: 'Nadia Putri',
      });
      expect(creators.map((option) => option.value)).not.toContain(goneId);
    });
  });

  it('offers each person under the name stored with their latest entry', async () => {
    await inRollback(async (tx, service) => {
      const creatorId = randomUUID();
      const admin = randomUUID();
      const acted = (name: string, at: string) =>
        entry(creatorId, {
          actor_user_id: admin,
          actor_name: name,
          actor_role: 'admin',
          occurred_at: new Date(at),
        });
      await tx.audit_logs.createMany({
        data: [
          acted('Bimo', '2026-10-01T00:00:00Z'),
          acted('Bimo Saputra', '2026-11-01T00:00:00Z'),
        ],
      });

      const { actors } = await service.filterOptions();
      const [item] = (
        await listed(service, creatorId, [
          new OccurredBetween(undefined, '2026-10-15'),
        ])
      ).items;

      expect(actors.filter((option) => option.value === admin)).toEqual([
        { value: admin, label: 'Bimo Saputra' },
      ]);
      expect(actors.at(-1)).toEqual({ value: 'system', label: 'Sistem' });
      // The entry keeps the name it was written with.
      expect(item.actor).toEqual({ name: 'Bimo', role: 'admin' });
    });
  });

  // OWASP A09:2025, A10:2025 on real jsonb: credentials dropped, anything but an object as none.
  it('shows stored values without credentials, and non-object values as none', async () => {
    await inRollback(async (tx, service) => {
      const creatorId = randomUUID();
      await tx.audit_logs.createMany({
        data: [
          entry(creatorId, {
            target_label: 'object',
            occurred_at: new Date('2026-11-02T00:00:00Z'),
            old_values: { rate: 1, api_key: 'k' },
            new_values: { rate: 2, nested: { password: 'p', note: 'ok' } },
          }),
          entry(creatorId, {
            target_label: 'list',
            occurred_at: new Date('2026-11-01T00:00:00Z'),
            old_values: ['rate'],
            new_values: 'rate',
          }),
        ],
      });

      const [object, list] = (await listed(service, creatorId)).items;

      expect(object.oldValues).toEqual({ rate: 1 });
      expect(object.newValues).toEqual({ rate: 2, nested: { note: 'ok' } });
      expect(list.oldValues).toBeNull();
      expect(list.newValues).toBeNull();
    });
  });
});
