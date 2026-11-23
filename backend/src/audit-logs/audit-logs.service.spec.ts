import { InCategories, allOf } from './audit-log-specs.js';
import { AuditLogsService } from './audit-logs.service.js';

const CREATOR = 'bbbbbbbb-0000-4000-8000-000000000001';
const GONE_CREATOR = 'bbbbbbbb-0000-4000-8000-000000000009';

const ROW = {
  id: 'cccccccc-0000-4000-8000-000000000001',
  occurred_at: new Date('2026-11-14T09:40:00.000Z'),
  actor_name: 'Bimo Saputra',
  actor_role: 'admin',
  category: 'invoice_pembayaran',
  action: 'invoice_finalized',
  target_type: 'invoice',
  target_id: 'dddddddd-0000-4000-8000-000000000001',
  target_label: 'Invoice Rafi Kurniawan',
  creator_id: CREATOR,
  old_values: { status: 'running' },
  new_values: { status: 'finalized', total: 4_500_000 },
  note: null,
};

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...ROW,
    id: `cccccccc-0000-4000-8000-${String(index).padStart(12, '0')}`,
  }));
}

describe('AuditLogsService (SCRUM-296)', () => {
  const prisma = {
    audit_logs: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    creators: { findMany: vi.fn() },
  };
  let service: AuditLogsService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.audit_logs.count.mockResolvedValue(1);
    prisma.audit_logs.findMany.mockResolvedValue([ROW]);
    prisma.creators.findMany.mockResolvedValue([
      {
        id: CREATOR,
        first_name: 'Rafi',
        middle_name: null,
        last_name: 'Kurniawan',
      },
    ]);
    service = new AuditLogsService(prisma as never);
  });

  describe('list', () => {
    const everything = allOf([]);

    it('answers each entry in the shape SCRUM-297 reads', async () => {
      const list = await service.list({ page: 1, filter: everything });

      expect(list).toEqual({
        items: [
          {
            id: ROW.id,
            occurredAt: '2026-11-14T09:40:00.000Z',
            actor: { name: 'Bimo Saputra', role: 'admin' },
            category: 'invoice_pembayaran',
            action: 'invoice_finalized',
            targetType: 'invoice',
            targetId: ROW.target_id,
            targetLabel: 'Invoice Rafi Kurniawan',
            creator: { id: CREATOR, name: 'Rafi Kurniawan' },
            oldValues: { status: 'running' },
            newValues: { status: 'finalized', total: 4_500_000 },
            note: null,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });

    // A record of who did what stays as it was: a later rename or role change never rewrites it.
    it('keeps the actor name and role stored with the entry, reading no account', async () => {
      prisma.audit_logs.findMany.mockResolvedValue([
        { ...ROW, actor_name: 'Rina (old name)', actor_role: 'super_admin' },
      ]);

      const [item] = (await service.list({ page: 1, filter: everything }))
        .items;

      expect(item.actor).toEqual({
        name: 'Rina (old name)',
        role: 'super_admin',
      });
      expect(prisma).not.toHaveProperty('users');
    });

    it('counts and reads with the same composed specification', async () => {
      const filter = allOf([new InCategories(['pengaturan'])]);

      await service.list({ page: 1, filter });

      const where = { AND: [{ category: { in: ['pengaturan'] } }] };
      expect(prisma.audit_logs.count).toHaveBeenCalledWith({ where });
      expect(prisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
    });

    // PBI-23 AC 17, OWASP A06:2025: 20 rows a page, newest first, ties kept in a stable order.
    it('reads 20 entries a page, newest first', async () => {
      prisma.audit_logs.count.mockResolvedValue(45);

      await service.list({ page: 2, filter: everything });

      expect(prisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
          skip: 20,
          take: 20,
        }),
      );
    });

    // OWASP A06:2025: a huge page number never becomes a huge offset.
    it('answers a page past the end with the last page', async () => {
      prisma.audit_logs.count.mockResolvedValue(45);

      const list = await service.list({ page: 1_000_000, filter: everything });

      expect(list).toMatchObject({ page: 3, total: 45, totalPages: 3 });
      expect(prisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    it('answers no entries as one empty page, looking up no creator', async () => {
      prisma.audit_logs.count.mockResolvedValue(0);
      prisma.audit_logs.findMany.mockResolvedValue([]);

      const list = await service.list({ page: 4, filter: everything });

      expect(list).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      });
      expect(prisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
      expect(prisma.creators.findMany).not.toHaveBeenCalled();
    });

    it('names each creator once, however many entries concern them', async () => {
      prisma.audit_logs.count.mockResolvedValue(3);
      prisma.audit_logs.findMany.mockResolvedValue(rows(3));

      await service.list({ page: 1, filter: everything });

      expect(prisma.creators.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.creators.findMany).toHaveBeenCalledWith({
        where: { id: { in: [CREATOR] } },
        select: {
          id: true,
          first_name: true,
          middle_name: true,
          last_name: true,
        },
      });
    });

    it('answers no creator for an Admin or settings entry', async () => {
      prisma.audit_logs.findMany.mockResolvedValue([
        { ...ROW, creator_id: null },
      ]);

      const [item] = (await service.list({ page: 1, filter: everything }))
        .items;

      expect(item.creator).toBeNull();
      expect(prisma.creators.findMany).not.toHaveBeenCalled();
    });

    // audit_logs has no foreign key, so an entry outlives its creator (OWASP A10:2025).
    it('answers no creator once the creator no longer exists', async () => {
      prisma.audit_logs.findMany.mockResolvedValue([
        { ...ROW, creator_id: GONE_CREATOR },
      ]);
      prisma.creators.findMany.mockResolvedValue([]);

      const [item] = (await service.list({ page: 1, filter: everything }))
        .items;

      expect(item.creator).toBeNull();
    });

    // AC 19: an entry written past AuditLogger (raw SQL, an older key list) still never shows a
    // credential; SCRUM-295's own filter is applied again on the way out (OWASP A09:2025).
    it('drops credentials from the stored values with the filter AuditLogger writes with', async () => {
      prisma.audit_logs.findMany.mockResolvedValue([
        {
          ...ROW,
          old_values: {
            status: 'running',
            token: 'stolen',
            nested: { otp_code: '123456', statusCode: 200 },
          },
          new_values: {
            authorization: 'Bearer x',
            cookie: 'sid=1',
            session_id: 's',
            statusCode: 201,
          },
        },
      ]);

      const [item] = (await service.list({ page: 1, filter: everything }))
        .items;

      expect(item.oldValues).toEqual({
        status: 'running',
        nested: { statusCode: 200 },
      });
      expect(item.newValues).toEqual({ statusCode: 201 });
    });

    // jsonb takes any JSON; SCRUM-297 reads only an object of fields (OWASP A10:2025).
    it.each([
      ['a list', ['status']],
      ['text', 'finalized'],
      ['a number', 3],
      ['nothing', null],
    ])('answers %s stored as values as no values', async (_name, stored) => {
      prisma.audit_logs.findMany.mockResolvedValue([
        { ...ROW, old_values: stored, new_values: stored },
      ]);

      const [item] = (await service.list({ page: 1, filter: everything }))
        .items;

      expect(item.oldValues).toBeNull();
      expect(item.newValues).toBeNull();
    });
  });

  describe('filterOptions', () => {
    const RINA = 'aaaaaaaa-0000-4000-8000-000000000001';
    const BIMO = 'aaaaaaaa-0000-4000-8000-000000000002';
    const NADIA = 'bbbbbbbb-0000-4000-8000-000000000003';

    function logHas(
      actors: {
        actor_user_id: string;
        actor_name: string;
        _max: { occurred_at: Date | null };
      }[],
      creatorIds: string[],
    ): void {
      prisma.audit_logs.groupBy.mockImplementation(
        async ({ by }: { by: string[] }) =>
          by.includes('creator_id')
            ? creatorIds.map((creator_id) => ({ creator_id }))
            : actors,
      );
    }

    it('offers each person who has an entry under the name they last acted with, then Sistem', async () => {
      logHas(
        [
          {
            actor_user_id: RINA,
            actor_name: 'Rina',
            _max: { occurred_at: new Date('2026-10-01T00:00:00Z') },
          },
          {
            actor_user_id: RINA,
            actor_name: 'Rina Wijaya',
            _max: { occurred_at: new Date('2026-11-01T00:00:00Z') },
          },
          {
            actor_user_id: BIMO,
            actor_name: 'Bimo Saputra',
            _max: { occurred_at: new Date('2026-11-02T00:00:00Z') },
          },
          {
            actor_user_id: RINA,
            actor_name: 'Rina W.',
            _max: { occurred_at: null },
          },
        ],
        [],
      );

      const { actors } = await service.filterOptions();

      expect(actors).toEqual([
        { value: BIMO, label: 'Bimo Saputra' },
        { value: RINA, label: 'Rina Wijaya' },
        { value: 'system', label: 'Sistem' },
      ]);
      expect(prisma.audit_logs.groupBy).toHaveBeenCalledWith({
        by: ['actor_user_id', 'actor_name'],
        where: { actor_user_id: { not: null } },
        _max: { occurred_at: true },
      });
    });

    it('offers each creator an entry concerns, by name, leaving out a creator who is gone', async () => {
      logHas([], [NADIA, CREATOR, GONE_CREATOR]);
      prisma.creators.findMany.mockResolvedValue([
        {
          id: NADIA,
          first_name: 'Nadia',
          middle_name: null,
          last_name: 'Putri',
        },
        {
          id: CREATOR,
          first_name: 'Rafi',
          middle_name: null,
          last_name: 'Kurniawan',
        },
      ]);

      const { creators } = await service.filterOptions();

      expect(creators).toEqual([
        { value: NADIA, label: 'Nadia Putri' },
        { value: CREATOR, label: 'Rafi Kurniawan' },
      ]);
      expect(prisma.audit_logs.groupBy).toHaveBeenCalledWith({
        by: ['creator_id'],
        where: { creator_id: { not: null } },
      });
    });

    it('offers only Sistem and no creator while the log is empty', async () => {
      logHas([], []);

      expect(await service.filterOptions()).toEqual({
        actors: [{ value: 'system', label: 'Sistem' }],
        creators: [],
      });
      expect(prisma.creators.findMany).not.toHaveBeenCalled();
    });
  });
});
