// The "Ubah Data" body (PBI-16): which fields an admin sent, read by the same rules, limits and
// messages as Tambah Creator (AC 3). Pure: what may change on this creator today is decided in
// creator-edit-policy.ts, against what is stored.
import { UnprocessableEntityException } from '@nestjs/common';
import type { contract_type, social_platform } from '@prisma/client';
import {
  checkContractType,
  checkEmail,
  checkName,
  checkUsername,
  readNumber,
  SOCIAL_PLATFORMS,
  toDay,
  USERNAME_FIELDS,
  type NewCreatorErrors,
} from './new-creator.js';

/** A creator's name as the table keeps it. */
export interface NameColumns {
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
}

/** The terms of one period an admin sent; only the ones present. */
export interface TermsEdit {
  contractType?: contract_type;
  fixedRate?: number;
  quota?: number;
  contractEnd?: Date;
}

/** What an admin sent, each field already valid on its own; a field not sent is absent. */
export interface CreatorEdit {
  name?: NameColumns;
  email?: string;
  /** "" clears the platform's username. */
  usernames: Partial<Record<social_platform, string>>;
  /** The period `terms` belong to; always there when `terms` holds any. */
  contractId?: string;
  terms: TermsEdit;
}

export function invalidEdit(errors: NewCreatorErrors): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data creator tidak valid',
    errors,
  });
}

function nameColumns(value: unknown, errors: NewCreatorErrors): NameColumns {
  const { firstName, middleName, lastName } = checkName(value, errors);
  return { first_name: firstName, middle_name: middleName, last_name: lastName };
}

function usernameEdits(
  body: Record<string, unknown>,
  errors: NewCreatorErrors,
): CreatorEdit['usernames'] {
  const usernames: CreatorEdit['usernames'] = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const field = USERNAME_FIELDS[platform];
    const value = body[field];
    if (value === undefined) continue;
    // Blank clears a username, so anything but text must not read as blank.
    if (typeof value === 'string') {
      usernames[platform] = checkUsername(field, value, errors);
    } else {
      errors[field] = 'Username tidak valid';
    }
  }
  return usernames;
}

function contractEnd(value: unknown, errors: NewCreatorErrors): Date {
  const day = toDay(value);
  if (value === '') {
    errors.contractEnd = 'Tanggal berakhir wajib diisi';
  } else if (!day) {
    errors.contractEnd = 'Tanggal berakhir tidak valid';
  }
  return day as Date;
}

function termsEdit(body: Record<string, unknown>, errors: NewCreatorErrors): TermsEdit {
  const terms: TermsEdit = {};
  if (body.contractType !== undefined) {
    terms.contractType = checkContractType(body.contractType, errors);
  }
  if (body.fixedRate !== undefined) {
    terms.fixedRate = readNumber('fixedRate', body.fixedRate, errors);
  }
  if (body.quota !== undefined) {
    terms.quota = readNumber('quota', body.quota, errors);
  }
  if (body.contractEnd !== undefined) {
    terms.contractEnd = contractEnd(body.contractEnd, errors);
  }
  return terms;
}

/**
 * Validates the body once, at the edge, field by field; any problem is one 422 naming each field.
 * Fields are picked by name, so nothing else a body carries can reach the database (OWASP A01).
 */
export function checkCreatorEdit(input: unknown): CreatorEdit {
  // As in checkNewCreator: a missing or null body reads as one that changes nothing.
  const body: Record<string, unknown> = { ...(input as object) };
  const errors: NewCreatorErrors = {};

  const edit: CreatorEdit = {
    usernames: usernameEdits(body, errors),
    terms: termsEdit(body, errors),
  };
  if (body.name !== undefined) edit.name = nameColumns(body.name, errors);
  if (body.email !== undefined) edit.email = checkEmail(body.email, errors);

  if (typeof body.contractId === 'string' && body.contractId !== '') {
    edit.contractId = body.contractId;
  } else if (body.contractId !== undefined || Object.keys(edit.terms).length > 0) {
    errors.contractId = 'Periode tidak valid';
  }

  if (Object.keys(errors).length > 0) throw invalidEdit(errors);
  return edit;
}
