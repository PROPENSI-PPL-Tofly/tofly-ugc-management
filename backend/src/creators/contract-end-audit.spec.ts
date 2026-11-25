import { PendingContractEndAudit } from './contract-end-audit.js';

describe('PendingContractEndAudit', () => {
  // Until PBI-23's AuditLogger reaches this branch the entry has nowhere to go; it must never
  // fail the end it would record.
  it('accepts an entry and writes nothing', async () => {
    const tx = { audit_logs: { create: vi.fn() } };

    await expect(
      new PendingContractEndAudit().recordBy(tx, 'admin-1', {
        action: 'contract_ended_early',
        target: { id: 'contract-1', label: 'Rangga Pratama' },
      }),
    ).resolves.toBeUndefined();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
});
