// What "Log Aktivitas" can record (PBI-23, SCRUM-295). One place names each action with its category
// and target, so a caller picks an action and can never file it under the wrong category.

export type AuditCategory =
  'akses_admin' | 'creator_kontrak' | 'invoice_pembayaran' | 'pengaturan';

export type AuditTargetType =
  | 'admin'
  | 'creator'
  | 'contract'
  | 'content_link'
  | 'invoice'
  | 'rate_formula'
  | 'buffer';

interface AuditActionDefinition {
  category: AuditCategory;
  targetType: AuditTargetType;
}

export const AUDIT_ACTIONS = {
  admin_added: { category: 'akses_admin', targetType: 'admin' },
  admin_changed: { category: 'akses_admin', targetType: 'admin' },
  admin_deactivated: { category: 'akses_admin', targetType: 'admin' },
  admin_reactivated: { category: 'akses_admin', targetType: 'admin' },

  creator_added: { category: 'creator_kontrak', targetType: 'creator' },
  creator_changed: { category: 'creator_kontrak', targetType: 'creator' },
  contract_extended: { category: 'creator_kontrak', targetType: 'contract' },
  period_changed: { category: 'creator_kontrak', targetType: 'contract' },
  period_deleted: { category: 'creator_kontrak', targetType: 'contract' },
  contract_ended_early: { category: 'creator_kontrak', targetType: 'contract' },
  manual_performance_saved: {
    category: 'creator_kontrak',
    targetType: 'content_link',
  },

  invoice_finalized: { category: 'invoice_pembayaran', targetType: 'invoice' },
  invoice_line_corrected: {
    category: 'invoice_pembayaran',
    targetType: 'invoice',
  },
  invoice_acknowledged: {
    category: 'invoice_pembayaran',
    targetType: 'invoice',
  },
  payment_proof_uploaded: {
    category: 'invoice_pembayaran',
    targetType: 'invoice',
  },
  payment_confirmed: { category: 'invoice_pembayaran', targetType: 'invoice' },
  invoice_cancelled: { category: 'invoice_pembayaran', targetType: 'invoice' },

  rate_formula_changed: { category: 'pengaturan', targetType: 'rate_formula' },
  buffer_changed: { category: 'pengaturan', targetType: 'buffer' },
} as const satisfies Record<string, AuditActionDefinition>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
