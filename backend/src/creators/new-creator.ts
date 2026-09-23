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

/** Postgres `integer`, the type of contracts.days_between and contracts.content_quota. */
export const MAX_INTEGER = 2 ** 31 - 1;
/** contracts.fixed_rate is numeric(14, 2): twelve digits before the point, two after. */
export const MAX_FIXED_RATE = 999_999_999_999.99;

/**
 * Minimum days between max(today, contract start) and any new deadline (PRD 3.6). The PRD
 * makes this an admin-editable global setting; until that setting exists, its default holds.
 */
export const DEFAULT_BUFFER_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * A calendar day from the date picker, as Postgres `date` columns hold it: midnight UTC.
 * Null unless the value is exactly a YYYY-MM-DD day: it has to come back unchanged from a
 * round trip through Date, which rejects 2026-02-30 (rolled into March), "2026" and
 * "2026-10" (parsed as the first of the year/month) and anything that is not a string.
 * Month 13 is not a Date at all, and toISOString() would throw on it, hence the NaN check.
 */
function toDay(value: unknown): Date | null {
  const day = new Date(`${String(value)}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) &&
    day.toISOString().slice(0, 10) === value
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

type NumberField = 'interval' | 'quota' | 'fixedRate';

const NUMBER_RULES: Record<
  NumberField,
  { label: string; tooSmall: string; whole: boolean; max: number }
> = {
  interval: {
    label: 'Jarak antar-deadline',
    tooSmall: 'Jarak antar-deadline minimal 1 hari',
    whole: true,
    max: MAX_INTEGER,
  },
  quota: {
    label: 'Jumlah konten',
    tooSmall: 'Jumlah konten harus lebih dari 0',
    whole: true,
    max: MAX_INTEGER,
  },
  fixedRate: {
    label: 'Fixed rate',
    tooSmall: 'Fixed rate harus lebih dari 0',
    whole: false,
    max: MAX_FIXED_RATE,
  },
};

/** True when the value has no more than two decimal places (what numeric(14, 2) stores). */
function hasCents(value: number): boolean {
  return Number(value.toFixed(2)) === value;
}

/**
 * Reads one positive number. Only a JSON number counts: "7" or true would be coerced by
 * JavaScript but mean the client is sending something other than what the form holds.
 */
function readNumber(
  field: NumberField,
  value: unknown,
  errors: NewCreatorErrors,
): number {
  const { label, tooSmall, whole, max } = NUMBER_RULES[field];

  // Number.isFinite is false for anything that is not a number, so this also rejects "7".
  if (!Number.isFinite(value)) {
    errors[field] = `${label} wajib diisi`;
  } else if ((value as number) <= 0) {
    errors[field] = tooSmall;
  } else if (whole && !Number.isInteger(value)) {
    errors[field] = `${label} harus bilangan bulat`;
  } else if (!whole && !hasCents(value as number)) {
    errors[field] = `${label} maksimal 2 angka desimal`;
  } else if ((value as number) > max) {
    errors[field] = `${label} terlalu besar`;
  }
  return value as number;
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

function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/**
 * The Evergreen slots the admin allocated, in date order (their Evg_ sequence numbers follow
 * it). Checked against the contract and quota only once those are valid themselves; otherwise
 * the slot error would just restate theirs.
 */
function checkDeadlines(
  value: unknown,
  { contractStart, contractEnd }: ContractPeriod,
  quota: number,
  now: Date,
  errors: NewCreatorErrors,
): Date[] {
  if (!Array.isArray(value)) {
    errors.deadlines = 'Jadwal deadline wajib diisi';
    return [];
  }

  const days = value.map(toDay);
  if (days.some((day) => day === null)) {
    errors.deadlines = 'Deadline tidak valid';
    return [];
  }

  const deadlines = (days as Date[]).sort((a, b) => a.getTime() - b.getTime());
  if (errors.contractStart || errors.contractEnd || errors.quota) {
    return deadlines;
  }

  const from = Math.max(startOfDay(now).getTime(), contractStart.getTime());
  const earliest = new Date(from + DEFAULT_BUFFER_DAYS * DAY_MS);

  if (deadlines.length !== quota) {
    errors.deadlines = `Jumlah deadline harus sama dengan jumlah konten (${quota})`;
  } else if (deadlines[0] < earliest) {
    errors.deadlines = `Deadline paling cepat ${isoDay(earliest)}`;
  } else if (deadlines[deadlines.length - 1] > contractEnd) {
    errors.deadlines = 'Deadline tidak boleh setelah akhir kontrak';
  }
  return deadlines;
}

/**
 * Validates the Add Creator body once, at the edge, and hands the service values it can save
 * without checking anything again.
 */
export function checkNewCreator(input: unknown, today: Date): NewCreator {
  // Spreading null or undefined yields {}, so a missing or null body gets the same per-field
  // 422 as a form left blank instead of a TypeError; a bare string only yields index keys.
  const body: Record<string, unknown> = { ...(input as object) };
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

  const interval = readNumber('interval', body.interval, errors);
  const quota = readNumber('quota', body.quota, errors);
  const fixedRate = readNumber('fixedRate', body.fixedRate, errors);
  const deadlines = checkDeadlines(
    body.deadlines,
    contract,
    quota,
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
    interval,
    quota,
    fixedRate,
    deadlines,
  };
}
