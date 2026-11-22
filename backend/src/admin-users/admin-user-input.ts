// What "Tambah Admin" and "Ubah Admin" accept (PBI-23, SCRUM-246): name (max 100), email (valid,
// max 254) and role. Every wrong field is named under its own key, so the form shows each message
// under its input, as Tambah Creator does (OWASP A03:2025 Injection: nothing unchecked reaches
// the database).

import { UnprocessableEntityException } from '@nestjs/common';
import type { AdminRole } from '../auth/google/ports.js';
import { checkEmail, MAX_NAME_LENGTH } from '../creators/new-creator.js';

export const ADMIN_ROLES: readonly AdminRole[] = ['admin', 'super_admin'];

export interface NewAdmin {
  name: string;
  /** Trimmed and lower-cased. */
  email: string;
  role: AdminRole;
}

/** "Ubah Admin": the name, and the role when the form sends one. */
export interface AdminChange {
  name: string;
  role?: AdminRole;
}

// Line breaks, tabs and the other control characters (Unicode Cc); the name shows on one line in
// the Pengguna Admin table and in Log Aktivitas.
const CONTROL_CHARACTER = /\p{Cc}/u;

type Errors = Partial<Record<'name' | 'email' | 'role', string>>;

function bodyOf(input: unknown): Record<string, unknown> {
  // Spreading null, undefined or text yields no fields, so it reads as a form left blank.
  return { ...(input as object) };
}

function checkName(value: unknown, errors: Errors): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name === '') {
    errors.name = 'Nama wajib diisi';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Nama maksimal ${MAX_NAME_LENGTH} karakter`;
  } else if (CONTROL_CHARACTER.test(name)) {
    errors.name = 'Nama berisi karakter yang tidak diizinkan';
  }
  return name;
}

export function checkRole(value: unknown, errors: Errors): AdminRole {
  if (!(ADMIN_ROLES as readonly unknown[]).includes(value)) {
    errors.role = 'Role wajib dipilih';
  }
  return value as AdminRole;
}

export function refuseIfAny(errors: Errors): void {
  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data admin tidak valid',
      errors,
    });
  }
}

export function checkNewAdmin(input: unknown): NewAdmin {
  const body = bodyOf(input);
  const errors: Errors = {};
  const name = checkName(body.name, errors);
  const email = checkEmail(body.email, errors).toLowerCase();
  const role = checkRole(body.role, errors);
  refuseIfAny(errors);
  return { name, email, role };
}

/** "Ubah Admin" changes the name and the role; the email never changes (a new address is a new Admin). */
export function checkAdminChange(input: unknown): AdminChange {
  const body = bodyOf(input);
  const errors: Errors = {};
  const name = checkName(body.name, errors);
  const role = body.role === undefined ? undefined : checkRole(body.role, errors);
  refuseIfAny(errors);
  return role === undefined ? { name } : { name, role };
}

/** The six digits of an email confirmation code. */
export function checkConfirmationCode(input: unknown): string {
  const code = bodyOf(input).code;
  const digits = typeof code === 'string' ? code.trim() : '';
  if (!/^\d{6}$/.test(digits)) {
    throw new UnprocessableEntityException({
      message: 'Kode tidak valid',
      errors: { code: 'Kode harus 6 angka' },
    });
  }
  return digits;
}
