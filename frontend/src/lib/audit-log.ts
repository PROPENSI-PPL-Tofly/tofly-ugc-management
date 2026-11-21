// What "Log Aktivitas" files its entries under (PBI-23, 23.7). Pure module: no fetch and no React,
// so the filters, the table and the tests share one vocabulary. The keys are the ones the backend
// stores (SCRUM-295), so a filter value reaches the API unchanged.

import { isUuid } from "./creator-detail";
import { EMPTY, formatTimestamp } from "./format";
import { calendarDay, list, listOf, pageNumber, single, type SearchParams } from "./search-params";

// PBI-23 AC 17: rows per page.
export const AUDIT_LOG_PAGE_SIZE = 20;

// The actor filter's value for entries no person made ("Sistem"), which have no user id.
export const SYSTEM_ACTOR = "system";

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

// The list's state as it lives in the URL.
export interface AuditLogState {
  page: number;
  // Calendar days, or empty for no limit.
  from: string;
  to: string;
  actor: string[];
  category: AuditCategory[];
  action: AuditAction[];
  creator: string[];
}

function once<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

// The URL's values, every one checked, so a typed or stale address can only reach the API with
// real days, ids, categories and actions (OWASP A05:2025). Anything else reads as no filter.
export function parseAuditLogParams(params: SearchParams): AuditLogState {
  const from = calendarDay(single(params.from));
  const to = calendarDay(single(params.to));
  const reversed = from !== "" && to !== "" && from > to;
  const category = once(listOf(AUDIT_CATEGORIES, params.category));

  return {
    page: pageNumber(params.page),
    from: reversed ? "" : from,
    to: reversed ? "" : to,
    actor: once(list(params.actor).filter((actor) => actor === SYSTEM_ACTOR || isUuid(actor))),
    category,
    action: keepActionsInCategories(once(listOf(actionsInCategories([]), params.action)), category),
    creator: once(list(params.creator).filter(isUuid)),
  };
}

// The non-default parts of the state, in a stable order, so the bare list stays at the bare address.
export function buildAuditLogQuery(state: AuditLogState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.from) query.from = state.from;
  if (state.to) query.to = state.to;
  if (state.actor.length > 0) query.actor = state.actor.join(",");
  if (state.category.length > 0) query.category = state.category.join(",");
  if (state.action.length > 0) query.action = state.action.join(",");
  if (state.creator.length > 0) query.creator = state.creator.join(",");
  if (state.page > 1) query.page = String(state.page);
  return query;
}

export type AuditActorRole = "super_admin" | "admin" | "creator" | "system";

const ACTOR_ROLE_LABELS: Record<Exclude<AuditActorRole, "system">, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  creator: "Creator",
};

// The Sprint 4 prototype's words. admin_changed, invoice_line_corrected, invoice_acknowledged and
// payment_confirmed have no agreed wording yet, so they show their key rather than a made-up label.
const AUDIT_ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  admin_added: "Tambah Admin",
  admin_deactivated: "Nonaktifkan Admin",
  admin_reactivated: "Aktifkan Admin",
  creator_added: "Tambah Creator",
  creator_changed: "Ubah Data Creator",
  contract_extended: "Perpanjang Kontrak",
  period_changed: "Ubah Periode",
  period_deleted: "Hapus Periode",
  contract_ended_early: "Akhiri Kontrak Lebih Awal",
  manual_performance_saved: "Isi Angka Manual",
  invoice_finalized: "Finalize Invoice",
  payment_proof_uploaded: "Upload Bukti Bayar",
  invoice_cancelled: "Batalkan Invoice",
  rate_formula_changed: "Ubah Formula Rate",
  buffer_changed: "Ubah Buffer Deadline",
};

export function auditActionLabel(action: AuditAction): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

// Who acted, as the row's two lines: the name over its role; "Sistem" has no role.
export function auditActorLines(actor: { name: string; role: AuditActorRole }): {
  name: string;
  role: string | null;
} {
  if (actor.role === "system") return { name: "Sistem", role: null };
  return { name: actor.name, role: ACTOR_ROLE_LABELS[actor.role] };
}

export function auditTimeLabel(occurredAt: string): string {
  return formatTimestamp(occurredAt);
}

export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

// jsonb does not keep key order, so objects are compared and shown with their keys sorted.
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.map(([key, item]) => [key, withSortedKeys(item)]));
}

function shownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (typeof value === "object") return JSON.stringify(withSortedKeys(value));
  return String(value);
}

// The fields an entry really changed, old values' fields first.
export function auditChanges(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): AuditChange[] {
  const before = oldValues ?? {};
  const after = newValues ?? {};
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);

  return [...fields]
    .map((field) => ({ field, from: shownValue(before[field]), to: shownValue(after[field]) }))
    .filter(({ from, to }) => from !== to);
}

export type AuditChangeView =
  | { kind: "none" }
  | { kind: "single"; change: AuditChange }
  | { kind: "expandable"; changes: AuditChange[] };

// SCRUM-297: one change reads on the row as old and new; several open from it.
export function auditChangeView(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): AuditChangeView {
  const changes = auditChanges(oldValues, newValues);
  if (changes.length === 0) return { kind: "none" };
  if (changes.length === 1) return { kind: "single", change: changes[0] };
  return { kind: "expandable", changes };
}
