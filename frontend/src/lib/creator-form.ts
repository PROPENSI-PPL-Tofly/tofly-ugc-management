// Pure validation for the Add Creator form. Kept apart from the modal component so each
// rule is testable without rendering anything, one RED/GREEN cycle at a time.

export interface CreatorFormInput {
  name: string;
  email: string;
  contractStart: string;
  contractEnd: string;
}

export interface CreatorFormErrors {
  name?: string;
  email?: string;
  contractStart?: string;
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCreatorForm(input: CreatorFormInput): CreatorFormErrors {
  const errors: CreatorFormErrors = {};

  if (input.name === "") {
    errors.name = "Nama wajib diisi";
  }

  if (!EMAIL_FORMAT.test(input.email)) {
    errors.email = "Format email tidak valid";
  }

  if (input.contractStart > input.contractEnd) {
    errors.contractStart = "Tanggal mulai tidak boleh setelah tanggal berakhir";
  }

  return errors;
}
