// Pure rules of "Ubah Data" (PBI-16, 16.2): what each field opens on, why one is read-only, what
// is wrong with a change and what saving sends. The server judges the same locks again (16.1's
// creator-edit-policy.ts) and has the last word; these only keep the form from offering a change
// it would refuse.

import type { CreatorPeriod, CreatorProfile } from "./creator-detail";
import {
  CONTRACT_TYPE_LABELS,
  validateCreatorForm,
  type ContractType,
  type CreatorFormErrors,
  type CreatorFormInput,
} from "./creator-form";
import { formatDate, formatRupiah } from "./format";
import {
  isUsernameLocked,
  SOCIAL_PLATFORMS,
  type SocialConnections,
  type SocialPlatform,
} from "./social-connection";

/** The fields Ubah Data can change, named as Tambah Creator and the API name them. */
export type CreatorEditInput = Pick<
  CreatorFormInput,
  | "name"
  | "email"
  | "instagramUsername"
  | "tiktokUsername"
  | "contractType"
  | "fixedRate"
  | "contractEnd"
  | "quota"
>;

export type EditField = keyof CreatorEditInput;

/** Why a username is read-only, as GET /creators/:id names it; null while it is not. */
export type UsernameLock = "connected" | "link_submitted" | null;

export type UsernameLocks = Record<SocialPlatform, UsernameLock>;

/** PATCH /creators/:id: only the changed fields, and the period when one of them is a term. */
export type CreatorEditRequest = Partial<
  Omit<CreatorEditInput, "fixedRate" | "contractType"> & {
    contractId: string;
    contractType: ContractType;
    fixedRate: number;
  }
>;

/** The fields as they are; a creator without a contract has no terms to edit. */
export function initialEdit(creator: CreatorProfile, period: CreatorPeriod | null): CreatorEditInput {
  return {
    name: creator.name,
    email: creator.email,
    instagramUsername: creator.socials.instagram ?? "",
    tiktokUsername: creator.socials.tiktok ?? "",
    contractType: period?.type ?? "",
    fixedRate: period?.fixedRate ?? null,
    contractEnd: period?.endDate ?? "",
    quota: period?.contentQuota ?? 0,
  };
}

const USERNAME_LOCK_REASONS: Record<Exclude<UsernameLock, null>, string> = {
  connected: "Mengikuti akun yang terhubung.",
  link_submitted: "Sudah ada link konten yang dikirim di platform ini.",
};

function isUsernameLock(value: unknown): value is UsernameLock {
  return value === null || (typeof value === "string" && Object.hasOwn(USERNAME_LOCK_REASONS, value));
}

/** The server's locks; one it did not send, or sent as something else, follows the connection. */
export function readUsernameLocks(raw: unknown, connections: SocialConnections): UsernameLocks {
  const source = (raw ?? {}) as Partial<Record<SocialPlatform, unknown>>;
  return Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => {
      const lock = source[platform];
      const fallback = isUsernameLocked(connections[platform]) ? "connected" : null;
      return [platform, isUsernameLock(lock) ? lock : fallback];
    }),
  ) as UsernameLocks;
}

/** Why each read-only field is one, for the tooltip beside its label. Absent: it can change. */
export type EditLocks = Partial<Record<EditField | "contractStart" | "interval", string>>;

const VIA_PERIOD = "Ubah lewat tombol Ubah Periode.";

/** Why a period's end and quota cannot change here, or undefined while it is active. */
function scheduleLock(period: CreatorPeriod): string | undefined {
  if (period.status === "upcoming") return VIA_PERIOD;
  if (period.status === "expired") return "Periode ini sudah berakhir.";
  return period.earlyEnd ? "Kontrak ini sudah diakhiri lebih awal." : undefined;
}

export function editLocks(usernames: UsernameLocks, period: CreatorPeriod | null): EditLocks {
  const locks: EditLocks = {};
  if (usernames.instagram) locks.instagramUsername = USERNAME_LOCK_REASONS[usernames.instagram];
  if (usernames.tiktok) locks.tiktokUsername = USERNAME_LOCK_REASONS[usernames.tiktok];
  if (!period) return locks;

  const fixed =
    period.status === "upcoming" ? VIA_PERIOD : "Tidak bisa diubah setelah periode dimulai.";
  locks.contractStart = fixed;
  locks.interval = fixed;

  const schedule = scheduleLock(period);
  if (schedule) {
    locks.contractEnd = schedule;
    locks.quota = schedule;
  }
  if (period.invoiceStatus !== "running") {
    locks.fixedRate = "Hanya bisa diubah selama invoice masih berjalan.";
  }
  return locks;
}

/** The earliest of the creator's periods that starts after this one. */
export function nextPeriod(
  period: CreatorPeriod | null,
  periods: readonly CreatorPeriod[],
): CreatorPeriod | null {
  if (!period) return null;
  const later = periods
    .filter((other) => other.startDate > period.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return later[0] ?? null;
}

/** The calendar day before another, "YYYY-MM-DD". */
export function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function contractEndProblem(
  end: string,
  initialEnd: string,
  next: CreatorPeriod | null,
): string | undefined {
  if (end === "") return "Tanggal berakhir wajib diisi";
  if (end < initialEnd) return `Akhir kontrak hanya bisa dimundurkan dari ${formatDate(initialEnd)}`;
  if (next && end >= next.startDate) {
    return `Paling lambat ${formatDate(dayBefore(next.startDate))}, sehari sebelum Periode ${next.periodNumber} mulai`;
  }
  return undefined;
}

/** A field's value as it is compared and sent: text trimmed, an email whatever its case. */
function comparable(field: EditField, input: CreatorEditInput): string | number | null {
  const value = input[field];
  if (typeof value !== "string") return value;
  return field === "email" ? value.trim().toLowerCase() : value.trim();
}

const FIELDS: readonly EditField[] = [
  "name",
  "email",
  "instagramUsername",
  "tiktokUsername",
  "contractType",
  "fixedRate",
  "contractEnd",
  "quota",
];

function changedFields(input: CreatorEditInput, initial: CreatorEditInput): EditField[] {
  return FIELDS.filter((field) => !Object.is(comparable(field, input), comparable(field, initial)));
}

/**
 * What is wrong with each changed field, by Tambah Creator's own rules (AC 3) and the period's
 * limits. A field left as it was is not judged: a value from before today's rules must not stop
 * an admin from fixing another one.
 */
export function validateCreatorEdit(
  input: CreatorEditInput,
  initial: CreatorEditInput,
  period: CreatorPeriod | null,
  next: CreatorPeriod | null,
): CreatorFormErrors {
  const rules: CreatorFormErrors = validateCreatorForm({
    ...input,
    email: input.email.trim(),
    // Not this form's to change, so never asked about below.
    contractStart: "",
    interval: 1,
  });
  rules.contractEnd = contractEndProblem(input.contractEnd, initial.contractEnd, next);
  const planned = period?.evergreenPlanned ?? 0;
  if (!rules.quota && input.quota < planned) {
    rules.quota = `Minimal ${planned}, sesuai konten Evergreen yang sudah ada`;
  }

  const errors: CreatorFormErrors = {};
  for (const field of changedFields(input, initial)) {
    if (rules[field]) errors[field] = rules[field];
  }
  return errors;
}

const LABELS: Record<EditField, string> = {
  name: "Nama Creator",
  email: "Email",
  instagramUsername: "Username Instagram",
  tiktokUsername: "Username TikTok",
  contractType: "Jenis Kontrak",
  fixedRate: "Fixed Rate",
  contractEnd: "Akhir Kontrak",
  quota: "Jumlah Konten",
};

function username(value: string): string {
  const typed = value.trim();
  return typed === "" ? "Kosong" : `@${typed}`;
}

/** One field as the confirmation words it. Only a valid form is confirmed, so no term is blank. */
function shown(field: EditField, input: CreatorEditInput): string {
  switch (field) {
    case "instagramUsername":
    case "tiktokUsername":
      return username(input[field]);
    case "contractType":
      return CONTRACT_TYPE_LABELS[input.contractType as ContractType];
    case "fixedRate":
      return formatRupiah(input.fixedRate as number);
    case "contractEnd":
      return formatDate(input.contractEnd);
    case "quota":
      return String(input.quota);
    default:
      return input[field].trim();
  }
}

export interface EditChange {
  field: EditField;
  label: string;
  from: string;
  to: string;
}

/** Every change, in the form's order, for the confirmation to list (AC 4). */
export function editChanges(input: CreatorEditInput, initial: CreatorEditInput): EditChange[] {
  return changedFields(input, initial).map((field) => ({
    field,
    label: LABELS[field],
    from: shown(field, initial),
    to: shown(field, input),
  }));
}

const TERMS: ReadonlySet<EditField> = new Set<EditField>([
  "contractType",
  "fixedRate",
  "contractEnd",
  "quota",
]);

/** Only the changed fields, under the names 16.1 reads them by. */
export function editRequest(
  input: CreatorEditInput,
  initial: CreatorEditInput,
  period: CreatorPeriod | null,
): CreatorEditRequest {
  const changed = changedFields(input, initial);
  const body: Record<string, unknown> = {};
  for (const field of changed) {
    const value = input[field];
    body[field] = typeof value === "string" ? value.trim() : value;
  }
  if (period && changed.some((field) => TERMS.has(field))) body.contractId = period.contractId;
  return body as CreatorEditRequest;
}

/** The toast: that it is saved, and what else the change set in motion. */
export function savedMessage(request: CreatorEditRequest, period: CreatorPeriod | null): string {
  const parts = ["Data creator disimpan."];
  if (request.email !== undefined) parts.push("Sesi creator diakhiri.");
  if (period && request.fixedRate !== undefined) {
    parts.push(`Invoice Periode ${period.periodNumber} dihitung ulang.`);
  }
  const open = (request.quota ?? 0) - (period?.evergreenPlanned ?? 0);
  if (request.quota !== undefined && open > 0) parts.push(`${open} slot Evergreen belum dialokasikan.`);
  return parts.join(" ");
}
