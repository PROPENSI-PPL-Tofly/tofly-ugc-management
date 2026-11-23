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
  });
});
