import { UnprocessableEntityException } from '@nestjs/common';
import type { social_platform } from '@prisma/client';

/** Longer than any real name; keeps a hostile body from filling the table. */
export const MAX_NAME_LENGTH = 100;
/** The longest address SMTP can deliver to (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254;

/** Every platform the database's `social_platform` enum accepts, spelled the same way. */
export const SOCIAL_PLATFORMS: social_platform[] = ['instagram', 'tiktok'];
/** A handle, not a bio. */
export const MAX_USERNAME_LENGTH = 100;

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

/** A text field's value with the padding the form may add; anything that is not text reads as blank. */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type NameParts = Pick<NewCreator, 'firstName' | 'middleName' | 'lastName'>;

/**
 * The form has one name field and the table has three columns: the first word is the first
 * name, the last word the last name, and everything between is the middle name.
 */
function checkName(value: unknown, errors: NewCreatorErrors): NameParts {
  const name = trimmed(value);
  const words = name.split(/\s+/);

  if (name === '') {
    errors.name = 'Nama wajib diisi';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Nama maksimal ${MAX_NAME_LENGTH} karakter`;
  }

  return {
    firstName: words[0],
    middleName: words.length > 2 ? words.slice(1, -1).join(' ') : null,
    lastName: words.length > 1 ? words[words.length - 1] : null,
  };
}

function checkEmail(value: unknown, errors: NewCreatorErrors): string {
  const email = trimmed(value);

  if (email === '') {
    errors.email = 'Email wajib diisi';
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_FORMAT.test(email)) {
    errors.email = 'Format email tidak valid';
  }

  return email;
}

type SocialAccount = Pick<NewCreator, 'socialPlatform' | 'socialUsername'>;

function checkSocial(
  platform: unknown,
  username: unknown,
  errors: NewCreatorErrors,
): SocialAccount {
  if (platform === undefined || platform === '') {
    errors.socialPlatform = 'Platform wajib dipilih';
  } else if (!SOCIAL_PLATFORMS.includes(platform as social_platform)) {
    errors.socialPlatform = 'Platform harus instagram atau tiktok';
  }

  const handle = trimmed(username);

  if (handle === '') {
    errors.socialUsername = 'Username wajib diisi';
  } else if (handle.length > MAX_USERNAME_LENGTH) {
    errors.socialUsername = `Username maksimal ${MAX_USERNAME_LENGTH} karakter`;
  }

  return {
    socialPlatform: platform as social_platform,
    socialUsername: handle,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar day from the date picker, as Postgres `date` columns hold it: midnight UTC.
 * Null when the value is not a real YYYY-MM-DD day; Date would quietly roll 2026-02-30 over
 * into March, so the day has to survive a round trip to count; month 13 is not a Date at
 * all, and calling toISOString() on it would throw.
 */
function toDay(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) {
    return null;
  }
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value)
    ? day
    : null;
}

/** `now` as the UTC calendar day, the same "today" the modal's date check uses. */
function startOfDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const DATE_LABELS = {
  contractStart: 'Tanggal mulai',
  contractEnd: 'Tanggal berakhir',
} as const;

/** Reads one date field, recording why it is unusable; null means an error was recorded. */
function readDate(
  field: keyof typeof DATE_LABELS,
  value: unknown,
  today: Date,
  errors: NewCreatorErrors,
): Date | null {
  const label = DATE_LABELS[field];

  if (value === undefined || value === '') {
    errors[field] = `${label} wajib diisi`;
    return null;
  }

  const day = toDay(value);

  if (!day) {
    errors[field] = `${label} tidak valid`;
  } else if (day < today) {
    errors[field] = `${label} tidak boleh sebelum hari ini`;
  }
  return day;
}

type ContractPeriod = Pick<NewCreator, 'contractStart' | 'contractEnd'>;

function checkContract(
  start: unknown,
  end: unknown,
  now: Date,
  errors: NewCreatorErrors,
): ContractPeriod {
  const today = startOfDay(now);
  const contractStart = readDate('contractStart', start, today, errors);
  const contractEnd = readDate('contractEnd', end, today, errors);

  if (
    contractStart &&
    contractEnd &&
    !errors.contractStart &&
    contractStart > contractEnd
  ) {
    errors.contractStart = 'Tanggal mulai tidak boleh setelah tanggal berakhir';
  }

  return {
    contractStart: contractStart as Date,
    contractEnd: contractEnd as Date,
  };
}

/**
 * Validates the Add Creator body once, at the edge, and hands the service values it can save
 * without checking anything again.
 */
export function checkNewCreator(input: unknown, today: Date): NewCreator {
  const body = input as Record<string, unknown>;
  const errors: NewCreatorErrors = {};
  const name = checkName(body.name, errors);
  const email = checkEmail(body.email, errors);
  const social = checkSocial(body.socialPlatform, body.socialUsername, errors);
  const contract = checkContract(
    body.contractStart,
    body.contractEnd,
    today,
    errors,
  );

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data creator tidak valid',
      errors,
    });
  }

  return {
    ...name,
    email,
    ...social,
    ...contract,
    interval: body.interval as number,
    quota: body.quota as number,
    fixedRate: body.fixedRate as number,
    deadlines: (body.deadlines as string[]).map(
      (value) => toDay(value) as Date,
    ),
  };
}
