// What "Log Aktivitas" files its entries under (PBI-23, 23.7). Pure module: no fetch and no React,
// so the filters, the table and the tests share one vocabulary. The keys are the ones the backend
// stores (SCRUM-295), so a filter value reaches the API unchanged.

export const AUDIT_CATEGORIES = [
  "akses_admin",
  "creator_kontrak",
  "invoice_pembayaran",
  "pengaturan",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

// PBI-23 AC 15: the category label each row shows.
export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  akses_admin: "Akses Admin",
  creator_kontrak: "Creator & Kontrak",
  invoice_pembayaran: "Invoice & Pembayaran",
  pengaturan: "Pengaturan",
};

export const AUDIT_ACTIONS_BY_CATEGORY = {
  akses_admin: ["admin_added", "admin_changed", "admin_deactivated", "admin_reactivated"],
  creator_kontrak: [
    "creator_added",
    "creator_changed",
    "contract_extended",
    "period_changed",
    "period_deleted",
    "contract_ended_early",
    "manual_performance_saved",
  ],
  invoice_pembayaran: [
    "invoice_finalized",
    "invoice_line_corrected",
    "invoice_acknowledged",
    "payment_proof_uploaded",
    "payment_confirmed",
    "invoice_cancelled",
  ],
  pengaturan: ["rate_formula_changed", "buffer_changed"],
} as const satisfies Record<AuditCategory, readonly string[]>;

export type AuditAction = (typeof AUDIT_ACTIONS_BY_CATEGORY)[AuditCategory][number];

// PBI-23 AC 17: the actions the filter offers, narrowed by the picked categories and in their
// fixed order; every action while none is picked.
export function actionsInCategories(categories: readonly AuditCategory[]): AuditAction[] {
  const shown = categories.length === 0 ? AUDIT_CATEGORIES : AUDIT_CATEGORIES.filter((category) => categories.includes(category));
  return shown.flatMap((category): readonly AuditAction[] => AUDIT_ACTIONS_BY_CATEGORY[category]);
}

// The picked actions still on offer once the categories change, so no hidden pick keeps filtering.
export function keepActionsInCategories(
  actions: readonly AuditAction[],
  categories: readonly AuditCategory[],
): AuditAction[] {
  const offered = new Set(actionsInCategories(categories));
  return actions.filter((action) => offered.has(action));
}
