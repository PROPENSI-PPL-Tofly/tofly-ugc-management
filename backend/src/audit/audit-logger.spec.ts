import { AUDIT_ACTIONS } from './audit-actions.js';
import { AuditLogger, SYSTEM_ACTOR, type AuditActor } from './audit-logger.js';

const ADMIN: AuditActor = {
  userId: '11111111-1111-4111-8111-111111111111',
  name: 'Rani',
  role: 'super_admin',
};
const CREATOR_ID = '22222222-2222-4222-8222-222222222222';
const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';

function stubTransaction() {
  const create = vi.fn().mockResolvedValue({});
  return { create, tx: { audit_logs: { create } } };
}

function savedData(create: ReturnType<typeof vi.fn>) {
  return create.mock.calls[0][0].data as Record<string, unknown>;
}

describe('AUDIT_ACTIONS', () => {
  // PBI-23 subtask 23.5: the entries of "Log Aktivitas", in its four categories.
  it.each([
    [
      'akses_admin',
      [
        'admin_added',
        'admin_changed',
        'admin_deactivated',
        'admin_reactivated',
      ],
    ],
    [
      'creator_kontrak',
      [
        'creator_added',
        'creator_changed',
        'contract_extended',
        'period_changed',
        'period_deleted',
        'contract_ended_early',
        'manual_performance_saved',
      ],
    ],
    [
      'invoice_pembayaran',
      [
        'invoice_finalized',
        'invoice_line_corrected',
        'invoice_acknowledged',
        'payment_proof_uploaded',
        'payment_confirmed',
        'invoice_cancelled',
      ],
    ],
    ['pengaturan', ['rate_formula_changed', 'buffer_changed']],
  ])('lists every %s action', (category, actions) => {
    const listed = Object.entries(AUDIT_ACTIONS)
      .filter(([, action]) => action.category === category)
      .map(([name]) => name);

    expect(listed).toEqual(actions);
  });

  it('holds the 19 actions and no other', () => {
    expect(Object.keys(AUDIT_ACTIONS)).toHaveLength(19);
  });
});

describe('AuditLogger', () => {
  const logger = new AuditLogger();

  it('writes the entry on the transaction it is given, so it lands or fails with the action', async () => {
    const { create, tx } = stubTransaction();

    await logger.record(tx, {
      actor: ADMIN,
      action: 'invoice_finalized',
      target: { id: CONTRACT_ID, label: 'Invoice Rani' },
      creatorId: CREATOR_ID,
      oldValues: { status: 'running' },
      newValues: { status: 'finalized', total: 2_500_000 },
      note: 'Akhir periode',
    });

    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: {
        actor_user_id: ADMIN.userId,
        actor_name: 'Rani',
        actor_role: 'super_admin',
        category: 'invoice_pembayaran',
        action: 'invoice_finalized',
        target_type: 'invoice',
        target_id: CONTRACT_ID,
        target_label: 'Invoice Rani',
        creator_id: CREATOR_ID,
        old_values: { status: 'running' },
        new_values: { status: 'finalized', total: 2_500_000 },
        note: 'Akhir periode',
      },
    });
  });

  it('records "Sistem" with no user when no person acted', async () => {
    const { create, tx } = stubTransaction();

    await logger.record(tx, {
      actor: SYSTEM_ACTOR,
      action: 'invoice_cancelled',
      target: { id: CONTRACT_ID, label: 'Invoice Rani' },
    });

    expect(savedData(create)).toMatchObject({
      actor_user_id: null,
      actor_name: 'Sistem',
      actor_role: 'system',
    });
  });

  it('leaves what an entry does not have empty', async () => {
    const { create, tx } = stubTransaction();

    await logger.record(tx, {
      actor: ADMIN,
      action: 'buffer_changed',
      target: { label: 'Buffer Deadline' },
    });

    expect(savedData(create)).toMatchObject({
      target_id: null,
      creator_id: null,
      note: null,
    });
    expect(savedData(create).old_values).toBeUndefined();
    expect(savedData(create).new_values).toBeUndefined();
  });

  it('lets a failed write reach the action, so the action rolls back with it', async () => {
    const { create, tx } = stubTransaction();
    create.mockRejectedValue(new Error('write failed'));

    await expect(
      logger.record(tx, {
        actor: ADMIN,
        action: 'rate_formula_changed',
        target: { label: 'Formula Rate' },
      }),
    ).rejects.toThrow('write failed');
  });

  // AC 19 (OWASP A09:2025): whatever a caller hands over, these never reach the log.
  it.each([
    'accessToken',
    'refresh_token',
    'token',
    'clientSecret',
    'password',
    'code',
    'loginCode',
    'sign_in_code',
    'otp',
    'fileContent',
    'file_content',
    'base64',
  ])('never stores %s, at any depth', async (key) => {
    const { create, tx } = stubTransaction();

    await logger.record(tx, {
      actor: ADMIN,
      action: 'admin_changed',
      target: { label: 'Rani' },
      oldValues: { name: 'Lama', [key]: 'hidden' },
      newValues: { name: 'Baru', nested: [{ role: 'admin', [key]: 'hidden' }] },
    });

    expect(savedData(create).old_values).toEqual({ name: 'Lama' });
    expect(savedData(create).new_values).toEqual({
      name: 'Baru',
      nested: [{ role: 'admin' }],
    });
  });

  it('keeps a file name but never the bytes of the file', async () => {
    const { create, tx } = stubTransaction();

    await logger.record(tx, {
      actor: ADMIN,
      action: 'payment_proof_uploaded',
      target: { id: CONTRACT_ID, label: 'Invoice Rani' },
      newValues: { fileName: 'bukti.pdf', file: Buffer.from('bytes') },
    });

    expect(savedData(create).new_values).toEqual({ fileName: 'bukti.pdf' });
  });

  it('stores a date as its ISO text', async () => {
    const { create, tx } = stubTransaction();

    await logger.record(tx, {
      actor: ADMIN,
      action: 'contract_extended',
      target: { id: CONTRACT_ID, label: 'Periode 2' },
      newValues: { start: new Date('2027-01-01T00:00:00.000Z') },
    });

    expect(savedData(create).new_values).toEqual({
      start: '2027-01-01T00:00:00.000Z',
    });
  });

  describe('actorOf', () => {
    function usersReturning(user: unknown) {
      const findUnique = vi.fn().mockResolvedValue(user);
      return { findUnique, tx: { users: { findUnique } } };
    }

    it.each([undefined, null])(
      'is "Sistem" when no user is behind the action (%s), reading nothing',
      async (userId) => {
        const { findUnique, tx } = usersReturning(null);

        await expect(logger.actorOf(tx, userId)).resolves.toBe(SYSTEM_ACTOR);
        expect(findUnique).not.toHaveBeenCalled();
      },
    );

    it('names an Admin with their name and role', async () => {
      const { tx } = usersReturning({
        name: 'Rani',
        email: 'rani@example.com',
        admin_role: 'super_admin',
      });

      await expect(logger.actorOf(tx, ADMIN.userId)).resolves.toEqual(ADMIN);
    });

    it('names a user without a name by their email', async () => {
      const { tx } = usersReturning({
        name: null,
        email: 'rani@example.com',
        admin_role: 'admin',
      });

      await expect(logger.actorOf(tx, ADMIN.userId)).resolves.toEqual({
        userId: ADMIN.userId,
        name: 'rani@example.com',
        role: 'admin',
      });
    });

    it('reads a user without an Admin role as a creator', async () => {
      const { tx } = usersReturning({
        name: null,
        email: 'rangga@example.com',
        admin_role: null,
      });

      await expect(logger.actorOf(tx, ADMIN.userId)).resolves.toMatchObject({
        role: 'creator',
      });
    });

    // A person acted, so the entry must still point at them and never read as "Sistem".
    it('keeps the id of a user who cannot be read, under "Admin"', async () => {
      const { tx } = usersReturning(null);

      await expect(logger.actorOf(tx, ADMIN.userId)).resolves.toEqual({
        userId: ADMIN.userId,
        name: 'Admin',
        role: 'admin',
      });
    });
  });
});
