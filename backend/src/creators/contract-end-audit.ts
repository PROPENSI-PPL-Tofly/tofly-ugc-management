// The "Log Aktivitas" entries an early end writes (PBI-37 → PBI-23, 23.5). The port has the shape of
// AuditLogger.recordBy, so once PBI-23's AuditModule reaches this branch the provider becomes
// `{ provide: CONTRACT_END_AUDIT, useExisting: AuditLogger }` and nothing else changes (DIP).

/** The actions an early end records, as PBI-23's AUDIT_ACTIONS names them. */
export type ContractEndAuditAction = 'contract_ended_early' | 'invoice_cancelled';

export interface ContractEndAuditEntry {
  action: ContractEndAuditAction;
  target: { id?: string; label: string };
  creatorId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  note?: string;
}

/** Writes one entry on the transaction of the end it records, so the two land or fail together. */
export interface ContractEndAudit {
  recordBy(
    tx: unknown,
    userId: string | null | undefined,
    entry: ContractEndAuditEntry,
  ): Promise<void>;
}

/** Nest injection token for ContractEndAudit, since an interface does not exist at runtime. */
export const CONTRACT_END_AUDIT = Symbol('CONTRACT_END_AUDIT');

/**
 * Stands in until the audit log table (PBI-23, 23.5) is merged: the entry has nowhere to go yet,
 * and an early end must not fail for it. Replaced by AuditLogger, never kept beside it.
 */
export class PendingContractEndAudit implements ContractEndAudit {
  readonly recordBy: ContractEndAudit['recordBy'] = () => Promise.resolve();
}
