// What an Ubah Data edit hands on (PBI-16): its "Log Aktivitas" entries to PBI-23's AuditLogger and
// its creator emails to PBI-11's CreatorEmails. Both are ports with the shape of those classes, so
// once they reach this branch each provider becomes a `useExisting` and nothing else changes (DIP),
// as contract-end-audit.ts does for an early end.

/** The actions an edit records, as PBI-23's AUDIT_ACTIONS names them. */
export type CreatorEditAuditAction = 'creator_changed' | 'period_changed';

export interface CreatorEditAuditEntry {
  action: CreatorEditAuditAction;
  target: { id?: string; label: string };
  creatorId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

/** Writes one entry on the transaction of the edit it records, so the two land or fail together. */
export interface CreatorEditAudit {
  recordBy(
    tx: unknown,
    userId: string | null | undefined,
    entry: CreatorEditAuditEntry,
  ): Promise<void>;
}

/** Nest injection token for CreatorEditAudit, since an interface does not exist at runtime. */
export const CREATOR_EDIT_AUDIT = Symbol('CREATOR_EDIT_AUDIT');

/** Stands in until the audit log table (PBI-23, 23.5) is merged; replaced, never kept beside it. */
export class PendingCreatorEditAudit implements CreatorEditAudit {
  readonly recordBy: CreatorEditAudit['recordBy'] = () => Promise.resolve();
}

/** The emails an edit sends once saved. Like every CreatorNotifier method, neither ever rejects. */
export interface CreatorEditNotifier {
  contractEndChanged(input: {
    creatorId: string;
    contractId: string;
    /** YYYY-MM-DD */
    endDate: string;
  }): Promise<void>;
  quotaChanged(input: { creatorId: string; contractId: string; quota: number }): Promise<void>;
}

/** Nest injection token for CreatorEditNotifier. */
export const CREATOR_EDIT_NOTIFIER = Symbol('CREATOR_EDIT_NOTIFIER');

/** Stands in until PBI-11's CreatorEmails answers these two events. */
export const silentCreatorEditNotifier: CreatorEditNotifier = {
  contractEndChanged: () => Promise.resolve(),
  quotaChanged: () => Promise.resolve(),
};
