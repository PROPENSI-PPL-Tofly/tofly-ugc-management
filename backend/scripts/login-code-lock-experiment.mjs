// SCRUM-240 (PBI-39.2): why PrismaLoginCodeIssuer takes an advisory lock. Runs the issuer's own
// count-then-insert 12 times at once for one email, first inside a plain transaction, then with
// pg_advisory_xact_lock first, and prints how many codes each variant let through (limit 5).
//
// A demonstration, not a test: a race shows up when timing allows, so it is never run by CI.
// It writes and then deletes its own rows, and only ever on a disposable local database:
//
//   cd backend
//   LOGIN_CODE_EXPERIMENT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/<scratch db> \
//     node scripts/login-code-lock-experiment.mjs
//
// The scratch database needs the migrations: DATABASE_URL=<same url> npx prisma migrate deploy

import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const LIMIT = 5;
const CONCURRENT = 12;
const ROUNDS = 3;

/** host:port/database, with every loopback name read as one, so two spellings compare equal. */
function identity(url) {
  const host = LOOPBACK.has(url.hostname) ? 'loopback' : url.hostname;
  return `${host}:${url.port || '5432'}${url.pathname}`;
}

function parse(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * The database the experiment may write to, or a refusal. It must be named on purpose in its own
 * variable, be on this machine, and be neither the default database nor the one the app uses.
 * A refusal never repeats the URL, so no password reaches the terminal.
 */
export function disposableDatabaseUrl(env) {
  const value = env.LOGIN_CODE_EXPERIMENT_DATABASE_URL;
  if (!value) {
    throw new Error(
      'LOGIN_CODE_EXPERIMENT_DATABASE_URL is not set: point it at a disposable local database.',
    );
  }
  const refuse = (why) => new Error(`Refusing to run the experiment: ${why}.`);
  if (env.NODE_ENV === 'production') throw refuse('NODE_ENV is production');
  const url = parse(value);
  if (url === null || !PROTOCOLS.has(url.protocol)) {
    throw refuse('not a PostgreSQL URL');
  }
  if (!LOOPBACK.has(url.hostname) || url.searchParams.has('host')) {
    throw refuse('the database is not on this machine');
  }
  if (url.pathname === '/postgres' || url.pathname === '/') {
    throw refuse('that is the default database, not a disposable one');
  }
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const app = env[name] ? parse(env[name]) : null;
    if (app !== null && identity(app) === identity(url)) {
      throw refuse(`that is the database ${name} points at`);
    }
  }
  return value;
}

/** PrismaLoginCodeIssuer.issue(), query for query, with the advisory lock optional. */
function issue(prisma, Prisma, email, withLock) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 3_600_000);
  return prisma.$transaction(async (tx) => {
    if (withLock) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`login_codes:${email}`}, 0))`,
      );
    }
    await tx.login_code_requests.deleteMany({
      where: { requested_at: { lte: windowStart } },
    });
    const recent = await tx.login_code_requests.findMany({
      where: { email, requested_at: { gt: windowStart } },
      orderBy: { requested_at: 'desc' },
      take: LIMIT,
      select: { requested_at: true },
    });
    if (recent.length >= LIMIT) return false;
    const newest = recent[0]?.requested_at.getTime() ?? -Infinity;
    const createdAt = new Date(Math.max(now.getTime(), newest + 1));
    await tx.login_codes.create({
      data: {
        email,
        code_hash: randomBytes(32).toString('hex'),
        created_at: createdAt,
        expires_at: new Date(createdAt.getTime() + 600_000),
      },
      select: { id: true },
    });
    await tx.login_code_requests.create({
      data: { email, requested_at: createdAt },
      select: { id: true },
    });
    return true;
  });
}

async function main() {
  // backend/.env, so the guard also knows the database the app uses; set variables win.
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // No .env: only variables set in the shell are compared.
  }
  const url = disposableDatabaseUrl(process.env);
  const { PrismaClient, Prisma } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const emails = [];
  try {
    const [{ transaction_isolation: isolation }] =
      await prisma.$queryRaw`SHOW transaction_isolation`;
    console.log(`isolation: ${isolation}`);
    for (const withLock of [false, true]) {
      for (let round = 1; round <= ROUNDS; round += 1) {
        const email = `experiment-${randomUUID()}@example.com`;
        emails.push(email);
        const results = await Promise.all(
          Array.from({ length: CONCURRENT }, () =>
            issue(prisma, Prisma, email, withLock),
          ),
        );
        const rows = await prisma.login_codes.count({ where: { email } });
        console.log(
          `${withLock ? 'advisory lock' : 'transaction only'} round ${round}: ` +
            `${results.filter(Boolean).length}/${CONCURRENT} issued, ` +
            `${rows} rows stored (limit ${LIMIT})`,
        );
      }
    }
  } finally {
    await prisma.login_codes.deleteMany({ where: { email: { in: emails } } });
    await prisma.login_code_requests.deleteMany({
      where: { email: { in: emails } },
    });
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
