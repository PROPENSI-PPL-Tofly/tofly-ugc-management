import type { social_platform } from '@prisma/client';

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
  const words = (body.name as string).split(' ');

  return {
    firstName: words[0],
    middleName: words.slice(1, -1).join(' '),
    lastName: words[words.length - 1],
    email: body.email as string,
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
