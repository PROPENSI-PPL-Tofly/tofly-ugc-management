import { UnprocessableEntityException } from '@nestjs/common';
import type { social_platform } from '@prisma/client';

/** Longer than any real name; keeps a hostile body from filling the table. */
export const MAX_NAME_LENGTH = 100;
/** The longest address SMTP can deliver to (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254;

// PRD 3.4's format rules as one pattern: exactly one "@", dot-separated runs of allowed
// characters on both sides (so no leading, trailing or doubled dots), and at least one dot in
// the domain. Every run is anchored by a literal dot, so the pattern cannot backtrack
// exponentially; the length cap is checked first regardless.
const EMAIL_FORMAT =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/** A creator as POST /creators saves it: already validated, already in the database's terms. */
export interface NewCreator {
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  email: string;
  socialPlatform: social_platform;
  socialUsername: string;
  contractStart: Date;
  contractEnd: Date;
  interval: number;
  quota: number;
  fixedRate: number;
  /** One per Evergreen slot the admin allocated in the schedule preview. */
  deadlines: Date[];
}

/** Keyed by the Add Creator modal's field names, so the modal can show each under its input. */
export type NewCreatorErrors = Partial<Record<string, string>>;

type NameParts = Pick<NewCreator, 'firstName' | 'middleName' | 'lastName'>;

/**
 * The form has one name field and the table has three columns: the first word is the first
 * name, the last word the last name, and everything between is the middle name.
 */
function checkName(value: unknown, errors: NewCreatorErrors): NameParts {
  const words = typeof value === 'string' ? value.trim().split(/\s+/) : [''];

  if (words[0] === '') {
    errors.name = 'Nama wajib diisi';
  } else if ((value as string).trim().length > MAX_NAME_LENGTH) {
    errors.name = `Nama maksimal ${MAX_NAME_LENGTH} karakter`;
  }

  return {
    firstName: words[0],
    middleName: words.length > 2 ? words.slice(1, -1).join(' ') : null,
    lastName: words.length > 1 ? words[words.length - 1] : null,
  };
}

function checkEmail(value: unknown, errors: NewCreatorErrors): string {
  const email = typeof value === 'string' ? value.trim() : '';

  if (email === '') {
    errors.email = 'Email wajib diisi';
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_FORMAT.test(email)) {
    errors.email = 'Format email tidak valid';
  }

  return email;
}

/** A calendar day from the date picker, as Postgres `date` columns hold it: midnight UTC. */
function toDay(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/**
 * Validates the Add Creator body once, at the edge, and hands the service values it can save
 * without checking anything again.
 */
export function checkNewCreator(input: unknown, _today: Date): NewCreator {
  const body = input as Record<string, unknown>;
  const errors: NewCreatorErrors = {};
  const name = checkName(body.name, errors);
  const email = checkEmail(body.email, errors);

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data creator tidak valid',
      errors,
    });
  }

  return {
    ...name,
    email,
    socialPlatform: body.socialPlatform as social_platform,
    socialUsername: body.socialUsername as string,
    contractStart: toDay(body.contractStart as string),
    contractEnd: toDay(body.contractEnd as string),
    interval: body.interval as number,
    quota: body.quota as number,
    fixedRate: body.fixedRate as number,
    deadlines: (body.deadlines as string[]).map(toDay),
  };
}
