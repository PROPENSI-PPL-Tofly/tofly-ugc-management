// What "Log Aktivitas" files its entries under (PBI-23, 23.7). Pure module: no fetch and no React,
// so the filters, the table and the tests share one vocabulary. The keys are the ones the backend
// stores (SCRUM-295), so a filter value reaches the API unchanged.

import { isUuid } from "./creator-detail";
import { EMPTY, formatDate, formatRupiah, formatTimestamp } from "./format";
import { EARLY_END_REASON_LABELS } from "./contract-extension";
import { INVOICE_PATH, INVOICE_STATUS_LABELS } from "./invoice";
import { calendarDay, list, listOf, pageNumber, single, type SearchParams } from "./search-params";

// PBI-23 AC 17: rows per page.
export const AUDIT_LOG_PAGE_SIZE = 20;

export const AUDIT_LOG_PATH = "/admin/log-aktivitas";

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

// The API refuses more values than this per filter, and a retry would repeat the same address.
const MAX_FILTER_VALUES = 50;

function once<T>(values: readonly T[]): T[] {
  return [...new Set(values)].slice(0, MAX_FILTER_VALUES);
}

// A range that ends before it starts is kept and named, never dropped: dropping it would silently
// show more entries than were asked for (OWASP A10:2025). One day on both ends is a valid range.
export function auditDatesReversed({ from, to }: Pick<AuditLogState, "from" | "to">): boolean {
  return from !== "" && to !== "" && from > to;
}

// The URL's values, every one checked, so a typed or stale address can only reach the API with
// real days, ids, categories and actions (OWASP A05:2025). Anything else reads as no filter.
export function parseAuditLogParams(params: SearchParams): AuditLogState {
  const page = pageNumber(params.page);
  const category = once(listOf(AUDIT_CATEGORIES, params.category));

  return {
    // Past the safe range the number prints as 1e+21, which the API cannot read.
    page: Number.isSafeInteger(page) ? page : 1,
    from: calendarDay(single(params.from)),
    to: calendarDay(single(params.to)),
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

// The list's own address for this state, so a retry keeps the filters and the page.
export function auditLogHref(state: AuditLogState): string {
  const search = new URLSearchParams(buildAuditLogQuery(state)).toString();
  return search ? `${AUDIT_LOG_PATH}?${search}` : AUDIT_LOG_PATH;
}

export type AuditActorRole = "super_admin" | "admin" | "creator" | "system";

export type AuditTargetType =
  | "admin"
  | "creator"
  | "contract"
  | "content_link"
  | "invoice"
  | "rate_formula"
  | "buffer";

// One row of the table. The fields follow the audit_logs columns (SCRUM-295).
export interface AuditLogRow {
  id: string;
  occurredAt: string;
  actor: { name: string; role: AuditActorRole };
  category: AuditCategory;
  action: AuditAction;
  targetType: AuditTargetType;
  targetLabel: string;
  // The creator the entry concerns, null when it has none or the creator no longer exists.
  creator: { id: string; name: string } | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  note: string | null;
}

export interface AuditLogList {
  items: AuditLogRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// What the page loads: one page of rows, and who the Aktor and Creator filters can offer.
export interface AuditLogLoaded {
  list: AuditLogList;
  actors: { value: string; label: string }[];
  creators: { value: string; label: string }[];
}

const ACTOR_ROLE_LABELS: Record<Exclude<AuditActorRole, "system">, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  creator: "Creator",
};

// The Sprint 4 prototype's words, and the team's where it has none for an action.
const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  admin_added: "Tambah Admin",
  admin_changed: "Ubah Admin",
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
  invoice_line_corrected: "Koreksi Invoice",
  invoice_acknowledged: "Konfirmasi Invoice",
  payment_proof_uploaded: "Upload Bukti Bayar",
  payment_confirmed: "Konfirmasi Pembayaran",
  invoice_cancelled: "Batalkan Invoice",
  rate_formula_changed: "Ubah Formula Rate",
  buffer_changed: "Ubah Buffer Deadline",
};

export function auditActionLabel(action: AuditAction): string {
  return AUDIT_ACTION_LABELS[action];
}

// PBI-23 AC 16: where a target lives. A creator that is gone has no page, so its entry stays text;
// Admin targets wait for "Pengguna Admin" (23.3), and the settings have no page of their own.
export function auditTargetHref({
  targetType,
  creator,
}: Pick<AuditLogRow, "targetType" | "creator">): string | null {
  if (!creator || !isUuid(creator.id)) return null;
  if (targetType === "invoice") {
    return `${INVOICE_PATH}?${new URLSearchParams({ q: creator.name })}`;
  }
  const onCreatorPage = targetType === "creator" || targetType === "contract" || targetType === "content_link";
  return onCreatorPage ? `/admin/creators/${creator.id}` : null;
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

// The backend logs a running invoice as "running"; the app's pipeline calls that step "accruing".
// An Admin's account is logged active or inactive (PBI-23 AC 10).
const STATUS_WORDS: Record<string, string> = {
  ...INVOICE_STATUS_LABELS,
  running: INVOICE_STATUS_LABELS.accruing,
  active: "Aktif",
  inactive: "Nonaktif",
};
const ROLE_WORDS: Record<string, string> = { admin: "Admin", super_admin: "Super Admin" };
const CONTRACT_TYPE_WORDS: Record<string, string> = { regular: "Regular", probation: "Probation" };
const PLATFORM_WORDS: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok" };
// PBI-37's choices, in the words its form uses.
const INVOICE_CHOICE_WORDS: Record<string, string> = {
  pay: "Bayar Sesuai Kontrak",
  cancel: "Batalkan Invoice",
};
const UPCOMING_WORDS: Record<string, string> = { keep: "Pertahankan", delete: "Hapus" };

type Format = (value: string) => string;

const isNumeric = (value: string) => /^-?\d+(\.\d+)?$/.test(value);
const asMoney: Format = (value) => (isNumeric(value) ? formatRupiah(Number(value)) : value);
const asCount: Format = (value) => (isNumeric(value) ? Number(value).toLocaleString("id-ID") : value);
const asDay: Format = (value) => (calendarDay(value) ? formatDate(value) : value);
const counted =
  (unit: string): Format =>
  (value) =>
    isNumeric(value) ? `${asCount(value)} ${unit}` : value;
const inWords =
  (words: Record<string, string>): Format =>
  (value) =>
    words[value] ?? value;
const asHandle: Format = (value) => `@${value}`;

/** A stored object or list read back, or undefined when it is not one. */
function parsed(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

const asPeriods: Format = (value) => {
  const numbers = parsed(value);
  if (!Array.isArray(numbers) || !numbers.every((item) => Number.isInteger(item))) return value;
  return numbers.length === 0 ? EMPTY : numbers.map((item) => `Periode ${String(item)}`).join(", ");
};

const asSocialAccounts: Format = (value) => {
  const accounts = parsed(value);
  if (!Array.isArray(accounts)) return value;
  const shown = accounts.map((account: { platform?: unknown; username?: unknown }) =>
    typeof account?.platform === "string" && typeof account.username === "string"
      ? `${PLATFORM_WORDS[account.platform] ?? account.platform} @${account.username}`
      : null,
  );
  if (shown.includes(null)) return value;
  return shown.length === 0 ? EMPTY : shown.join(", ");
};

const asContract: Format = (value) => {
  const terms = parsed(value) as Record<string, unknown> | undefined;
  if (typeof terms !== "object" || terms === null || Array.isArray(terms)) return value;
  const { contractType, startDate, endDate, quota, fixedRate } = terms;
  if (typeof startDate !== "string" || typeof endDate !== "string") return value;
  return [
    typeof contractType === "string" ? (CONTRACT_TYPE_WORDS[contractType] ?? contractType) : null,
    `${asDay(startDate)} – ${asDay(endDate)}`,
    typeof quota === "number" ? `${quota} konten` : null,
    typeof fixedRate === "number" ? formatRupiah(fixedRate) : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
};

const asPerformanceBonus: Format = (value) => {
  const byPlatform = parsed(value);
  if (typeof byPlatform !== "object" || byPlatform === null || Array.isArray(byPlatform)) return value;
  const platforms = Object.entries(byPlatform as Record<string, { metric?: unknown; tiers?: unknown }>);
  if (platforms.length === 0) return EMPTY;
  return platforms
    .map(([platform, bonus]) => {
      const name = PLATFORM_WORDS[platform] ?? platform;
      const tiers = Array.isArray(bonus?.tiers) ? bonus.tiers.length : 0;
      return typeof bonus?.metric === "string"
        ? `${name}: ${bonus.metric}, ${tiers} tingkat`
        : `${name}: belum diatur`;
    })
    .join(" · ");
};

/**
 * Every field the backend's audit entries carry (the recordBy callers under backend/src), with the
 * name and value format Log Aktivitas shows. One registry, so a field is named and read in one
 * place; the "every logged action" test fails for a field the backend starts writing without one.
 */
const AUDIT_FIELDS: Record<string, { label: string; format?: Format }> = {
  status: { label: "Status", format: inWords(STATUS_WORDS) },
  role: { label: "Peran", format: inWords(ROLE_WORDS) },
  name: { label: "Nama" },
  email: { label: "Email" },
  total: { label: "Total", format: asMoney },
  fixedRate: { label: "Fixed Rate", format: asMoney },
  specificBonus: { label: "Bonus Spesifik", format: asMoney },
  performanceBonus: { label: "Bonus Performa", format: asPerformanceBonus },
  latePenaltyPerDay: { label: "Denda per Hari", format: asMoney },
  maxPenaltyDays: { label: "Maks. Hari Denda", format: asCount },
  startDate: { label: "Tanggal Mulai", format: asDay },
  endDate: { label: "Tanggal Selesai", format: asDay },
  contractEnd: { label: "Akhir Kontrak", format: asDay },
  contractType: { label: "Tipe Kontrak", format: inWords(CONTRACT_TYPE_WORDS) },
  interval: { label: "Interval (hari)", format: asCount },
  quota: { label: "Kuota", format: asCount },
  bufferDays: { label: "Buffer Deadline", format: counted("hari") },
  views: { label: "Views", format: asCount },
  likes: { label: "Likes", format: asCount },
  comments: { label: "Komentar", format: asCount },
  shares: { label: "Shares", format: asCount },
  platform: { label: "Platform", format: inWords(PLATFORM_WORDS) },
  fileName: { label: "Nama File" },
  socialAccounts: { label: "Akun Sosial", format: asSocialAccounts },
  instagramUsername: { label: "Username Instagram", format: asHandle },
  tiktokUsername: { label: "Username TikTok", format: asHandle },
  contract: { label: "Kontrak", format: asContract },
  reason: { label: "Alasan", format: inWords(EARLY_END_REASON_LABELS) },
  invoice: { label: "Invoice", format: inWords(INVOICE_CHOICE_WORDS) },
  upcomingPeriods: { label: "Periode Belum Dimulai", format: inWords(UPCOMING_WORDS) },
  keptPeriods: { label: "Periode Dipertahankan", format: asPeriods },
  deletedPeriods: { label: "Periode Dihapus", format: asPeriods },
  closedContents: { label: "Konten Ditutup", format: counted("konten") },
};

// A change in the app's words. A field or value it cannot read stays as stored, because an audit
// record never hides what happened; a blank stays the dash.
export function auditChangeShown({ field, from, to }: AuditChange): {
  label: string;
  from: string;
  to: string;
} {
  const spec = Object.hasOwn(AUDIT_FIELDS, field) ? AUDIT_FIELDS[field] : undefined;
  const format = spec?.format ?? ((value: string) => value);
  const shown = (value: string) => (value === EMPTY ? EMPTY : format(value));
  return { label: spec?.label ?? field, from: shown(from), to: shown(to) };
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
