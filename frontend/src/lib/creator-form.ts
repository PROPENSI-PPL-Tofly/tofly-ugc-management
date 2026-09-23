// Pure validation for the Add Creator form. Kept apart from the modal component so each
// rule is testable without rendering anything, one RED/GREEN cycle at a time.

export interface CreatorFormInput {
  name: string;
  email: string;
  contractStart: string;
  contractEnd: string;
  interval: number;
  quota: number;
  fixedRate: number;
}

export interface CreatorFormErrors {
  name?: string;
  email?: string;
  contractStart?: string;
  interval?: string;
  quota?: string;
  fixedRate?: string;
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

  if (input.quota < 0) {
    errors.quota = "Jumlah konten tidak boleh negatif";
  }

  if (input.fixedRate <= 0) {
    errors.fixedRate = "Fixed rate harus lebih dari 0";
  }

  return errors;
}
