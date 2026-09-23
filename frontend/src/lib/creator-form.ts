// Pure validation for the Add Creator form. Kept apart from the modal component so each
// rule is testable without rendering anything, one RED/GREEN cycle at a time.

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
  interval?: string;
  quota?: string;
  fixedRate?: string;
  socialPlatform?: string;
  socialUsername?: string;
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `today` as the same calendar-day string format the API and this form use. */
function calendarDay(today: Date): string {
  return today.toISOString().slice(0, 10);
}

export function validateCreatorForm(
  input: CreatorFormInput,
  today: Date = new Date(),
  existingEmails: string[] = [],
): CreatorFormErrors {
  const errors: CreatorFormErrors = {};

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

  if (input.contractStart < calendarDay(today)) {
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

  return errors;
}
