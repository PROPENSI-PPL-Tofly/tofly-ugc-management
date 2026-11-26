// What Tambah Admin and Ubah Admin check before they ask the API (PBI-23, 23.4): a name, an
// email on a new admin, and a role. The words live here so both forms and their tests read the
// same ones, and so an edit cannot re-judge the email it does not let anyone change.

import type { AdminRole, AdminUser } from "./admin-users";
import { EMAIL_FORMAT, MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from "./creator-form";

/** Why the screen shuts these on the caller's own row (AC 6 and AC 10), beside the control. */
export const SELF_ROLE_REASON = "Peran sendiri tidak bisa diubah";
export const SELF_DEACTIVATE_REASON = "Super Admin tidak bisa menonaktifkan dirinya sendiri";

/** Whether the role select may be changed: never on the caller's own row. */
export function canChangeRole(user: Pick<AdminUser, "isSelf">): boolean {
  return !user.isSelf;
}

/** Whether the row may be deactivated: never on the caller's own row, and only while active. */
export function canDeactivate(user: Pick<AdminUser, "isSelf" | "isActive">): boolean {
  return !user.isSelf && user.isActive;
}

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

/** A refusal the form shows: the line above it, and the field that carries the fix. */
export interface AdminRefusal {
  message: string;
  errors: AdminFormErrors;
}

/**
 * The backend's codes in the form's words. The two the ACs name are pinned to their fields
 * ("Email sudah dipakai", "Minimal harus ada satu Super Admin"); the rest are one line.
 */
export function adminRefusal(code: unknown): AdminRefusal | null {
  switch (code) {
    case "EMAIL_TAKEN":
      return {
        message: "Email sudah dipakai",
        errors: { email: "Email sudah dipakai" },
      };

    case "LAST_SUPER_ADMIN":
      return {
        message: "Minimal harus ada satu Super Admin",
        errors: { role: "Minimal harus ada satu Super Admin" },
      };

    case "SELF_ROLE":
      return {
        message: SELF_ROLE_REASON,
        errors: { role: SELF_ROLE_REASON },
      };

    case "SELF_DEACTIVATE":
      return { message: SELF_DEACTIVATE_REASON, errors: {} };

    case "FORBIDDEN":
      return { message: "Hanya Super Admin yang bisa mengelola admin", errors: {} };

    default:
      return null;
  }
}

/** One empty object for every form's default, so useFieldErrors sees no change to answer. */
export const NO_ADMIN_ERRORS: AdminFormErrors = {};

/** A refusal the API sent back, kept until the Super Admin edits the field it named. */
export interface AdminFailure {
  message: string;
  errors: AdminFormErrors;
}

/** A refusal about the whole action, rather than about one of its fields. */
export function formLine(failure: AdminFailure | null): string | undefined {
  return failure && Object.keys(failure.errors).length === 0 ? failure.message : undefined;
}
