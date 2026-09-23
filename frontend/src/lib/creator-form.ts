// Pure validation for the Add Creator form. Kept apart from the modal component so each
// rule is testable without rendering anything, one RED/GREEN cycle at a time.

import { getDeadlinePreview, type DeadlinePreview } from "./deadline-schedule";

/** Days between max(today, contract start) and the first deadline; the API's default buffer. */
export const BUFFER_DAYS = 5;

// Matches the database's `social_platform` enum (supabase/migrations/..._creator_database.sql)
// exactly — "" stands for "not chosen yet", the empty state of the select in the modal.
export type SocialPlatform = "instagram" | "tiktok";

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
  deadlines?: string;
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** The `min`/`max` of the date pickers, so an impossible contract cannot even be picked. */
export function contractDateLimits({ contractStart, contractEnd }: ContractPeriod, today: string) {
  return {
    startMin: today,
    startMax: contractEnd || undefined,
    endMin: contractStart || today,
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

export function validateCreatorForm(
  input: CreatorFormInput,
  today: Date = new Date(),
  existingEmails: string[] = [],
): CreatorFormErrors {
  const errors: CreatorFormErrors = {};
  const todayDay = localCalendarDay(today);

  if (input.name === "") {
    errors.name = "Nama wajib diisi";
  }

  if (!EMAIL_FORMAT.test(input.email)) {
    errors.email = "Format email tidak valid";
  } else if (existingEmails.includes(input.email)) {
    errors.email = "Email sudah terdaftar";
  }

  if (input.contractStart > input.contractEnd) {
    errors.contractStart = "Tanggal mulai tidak boleh setelah tanggal berakhir";
  }

  if (input.contractStart < todayDay) {
    errors.contractStart = "Tanggal mulai tidak boleh sebelum hari ini";
  }

  if (input.interval <= 0) {
    errors.interval = "Jarak antar-deadline minimal 1 hari";
  }

  if (input.quota <= 0) {
    errors.quota = "Jumlah konten harus lebih dari 0";
  }

  if (input.fixedRate <= 0) {
    errors.fixedRate = "Fixed rate harus lebih dari 0";
  }

  if (input.socialPlatform === "") {
    errors.socialPlatform = "Platform wajib dipilih";
  }

  if (input.socialUsername === "") {
    errors.socialUsername = "Username wajib diisi";
  }

  const schedule = scheduleDeadlines(input, todayDay);
  if (schedule !== null && schedule.remainingCount > 0) {
    errors.deadlines = `Kontrak hanya memuat ${schedule.allocatedCount} dari ${schedule.quota} deadline`;
  }

  return errors;
}
