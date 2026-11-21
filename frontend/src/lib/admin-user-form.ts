// What Tambah Admin and Ubah Admin check before they ask the API (PBI-23, 23.4): a name, an
// email on a new admin, and a role. The words live here so both forms and their tests read the
// same ones, and so an edit cannot re-judge the email it does not let anyone change.

import type { AdminRole } from "./admin-users";
import { EMAIL_FORMAT, MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from "./creator-form";

export type AdminFormMode = "create" | "edit";

export interface AdminFormValues {
  name: string;
  email: string;
  role: AdminRole | "";
}

export type AdminFormErrors = Partial<Record<"name" | "email" | "role", string>>;

export const EMPTY_ADMIN_FORM: AdminFormValues = { name: "", email: "", role: "" };

/** Every rule, as the field it belongs to; an empty object is a form that can be sent. */
export function validateAdminForm(
  values: AdminFormValues,
  mode: AdminFormMode,
): AdminFormErrors {
  const errors: AdminFormErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = "Nama wajib diisi";
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Nama maksimal ${MAX_NAME_LENGTH} karakter`;
  }

  if (mode === "create") {
    const email = values.email.trim();

    if (!email) {
      errors.email = "Email wajib diisi";
    } else if (email.length > MAX_EMAIL_LENGTH) {
      errors.email = `Email maksimal ${MAX_EMAIL_LENGTH} karakter`;
    } else if (!EMAIL_FORMAT.test(email)) {
      errors.email = "Format email tidak valid";
    }
  }

  if (!values.role) {
    errors.role = "Pilih peran";
  }

  return errors;
}
