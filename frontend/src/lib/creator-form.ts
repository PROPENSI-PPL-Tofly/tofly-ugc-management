// Pure validation for the Add Creator form. Kept apart from the modal component so each
// rule is testable without rendering anything, one RED/GREEN cycle at a time.

import { getBufferWindow, getDeadlinePreview, type DeadlinePreview } from "./deadline-schedule";
import { formatDate } from "./format";

/** Days between max(today, contract start) and the first deadline; the API's default buffer. */
export const BUFFER_DAYS = 5;

// The same limits the API enforces (backend new-creator.ts), so the form never lets through
// what the server would refuse, and says so while the admin is still typing.
export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_USERNAME_LENGTH = 100;
/** More contents than this in one contract is a typo, not a deal. */
export const MAX_CONTENT_QUOTA = 100;

// Matches the database's `social_platform` enum (supabase/migrations/..._creator_database.sql)
// exactly — "" stands for "not chosen yet", the empty state of the select in the modal.
export type SocialPlatform = "instagram" | "tiktok";

// Matches the database's `contract_type` enum. Informational only (PRD 3.4): no rule reads it.
export type ContractType = "probation" | "regular";

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  probation: "Probation",
  regular: "Regular",
};

/** "Probation · " to lead a contract note, or nothing for a creator without a contract. */
export function contractTypePrefix(type: ContractType | null): string {
  return type ? `${CONTRACT_TYPE_LABELS[type]} · ` : "";
}

export interface CreatorFormInput {
  name: string;
  email: string;
  contractStart: string;
  contractEnd: string;
  interval: number;
  quota: number;
  fixedRate: number;
  socialPlatform: SocialPlatform | "";
  socialUsername: string;
  contractType: ContractType | "";
}

export interface CreatorFormErrors {
  name?: string;
  email?: string;
  contractStart?: string;
  contractEnd?: string;
  interval?: string;
  quota?: string;
  fixedRate?: string;
  socialPlatform?: string;
  socialUsername?: string;
  contractType?: string;
  deadlines?: string;
}

// The API's pattern (backend new-creator.ts): dot-separated runs of allowed characters on both
// sides of one "@", and at least one dot in the domain.
const EMAIL_FORMAT =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/**
 * `today` as the admin sees it on their own calendar, in the `YYYY-MM-DD` format the API and
 * the date inputs use. Read in local time: just after midnight WIB it is still yesterday in UTC.
 */
export function localCalendarDay(today: Date): string {
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

type ContractPeriod = Pick<CreatorFormInput, "contractStart" | "contractEnd">;

/**
 * The first day a contract may end on: the buffer after max(today, start), which is also the
 * first day a deadline may fall on. Ending earlier leaves a contract no content can fit in.
 */
export function earliestContractEnd(contractStart: string, today: string): string {
  return getBufferWindow({ contractStart: contractStart || today, today, bufferDays: BUFFER_DAYS })
    .firstAllowedDate.toISOString()
    .slice(0, 10);
}

/** The `min`/`max` of the date pickers, so an impossible contract cannot even be picked. */
export function contractDateLimits({ contractStart, contractEnd }: ContractPeriod, today: string) {
  return {
    startMin: today,
    startMax: contractEnd || undefined,
    endMin: earliestContractEnd(contractStart, today),
  };
}

/** The auto-generated deadlines for the contract so far, or null while it is incomplete. */
export function scheduleDeadlines(
  input: ContractPeriod & Pick<CreatorFormInput, "interval" | "quota">,
  today: string,
): DeadlinePreview | null {
  const { contractStart, contractEnd, interval, quota } = input;
  if (!contractStart || !contractEnd || contractStart > contractEnd || interval <= 0 || quota <= 0) {
    return null;
  }

  return getDeadlinePreview({
    contractStart,
    contractEnd,
    today,
    bufferDays: BUFFER_DAYS,
    intervalDays: interval,
    quota,
  });
}

/** A required text field's problem: empty (spaces count as empty) or longer than the API takes. */
function textProblem(value: string, max: number, empty: string, label: string): string | undefined {
  if (value.trim() === "") return empty;
  if (value.length > max) return `${label} maksimal ${max} karakter`;
  return undefined;
}

/** Start and end, each named when missing, then checked against today and each other. */
function checkContractDates(
  { contractStart, contractEnd }: ContractPeriod,
  todayDay: string,
  errors: CreatorFormErrors,
) {
  if (contractStart === "") {
    errors.contractStart = "Tanggal mulai wajib diisi";
  } else if (contractStart < todayDay) {
    errors.contractStart = "Tanggal mulai tidak boleh sebelum hari ini";
  }

  if (contractEnd === "") {
    errors.contractEnd = "Tanggal berakhir wajib diisi";
  } else if (contractEnd < todayDay) {
    errors.contractEnd = "Tanggal berakhir tidak boleh sebelum hari ini";
  }

  if (errors.contractStart || errors.contractEnd) return;

  if (contractStart > contractEnd) {
    errors.contractStart = "Tanggal mulai tidak boleh setelah tanggal berakhir";
    return;
  }

  const earliestEnd = earliestContractEnd(contractStart, todayDay);
  if (contractEnd < earliestEnd) {
    errors.contractEnd = `Akhir kontrak paling cepat ${formatDate(earliestEnd)} (masa buffer ${BUFFER_DAYS} hari)`;
  }
}

/**
 * Whether the schedule preview has what it needs: dates, interval and quota all without a
 * problem. Until then the calendar would draw a contract that cannot be saved anyway.
 */
export function scheduleReady(errors: CreatorFormErrors): boolean {
  return !errors.contractStart && !errors.contractEnd && !errors.interval && !errors.quota;
}

export function validateCreatorForm(
  input: CreatorFormInput,
  today: Date = new Date(),
  existingEmails: string[] = [],
): CreatorFormErrors {
  const errors: CreatorFormErrors = {};
  const todayDay = localCalendarDay(today);

  const name = textProblem(input.name, MAX_NAME_LENGTH, "Nama wajib diisi", "Nama");
  if (name) errors.name = name;

  if (input.email.length > MAX_EMAIL_LENGTH) {
    errors.email = `Email maksimal ${MAX_EMAIL_LENGTH} karakter`;
  } else if (!EMAIL_FORMAT.test(input.email)) {
    errors.email = "Format email tidak valid";
  } else if (existingEmails.includes(input.email)) {
    errors.email = "Email sudah terdaftar";
  }

  checkContractDates(input, todayDay, errors);

  if (input.interval <= 0) {
    errors.interval = "Jarak antar-deadline minimal 1 hari";
  }

  if (input.quota <= 0) {
    errors.quota = "Jumlah konten harus lebih dari 0";
  } else if (input.quota > MAX_CONTENT_QUOTA) {
    errors.quota = `Jumlah konten maksimal ${MAX_CONTENT_QUOTA}`;
  }

  if (input.fixedRate <= 0) {
    errors.fixedRate = "Fixed rate harus lebih dari 0";
  }

  if (input.socialPlatform === "") {
    errors.socialPlatform = "Platform wajib dipilih";
  }

  const username = textProblem(
    input.socialUsername,
    MAX_USERNAME_LENGTH,
    "Username wajib diisi",
    "Username",
  );
  if (username) errors.socialUsername = username;

  if (input.contractType === "") {
    errors.contractType = "Jenis kontrak wajib dipilih";
  }

  return errors;
}
