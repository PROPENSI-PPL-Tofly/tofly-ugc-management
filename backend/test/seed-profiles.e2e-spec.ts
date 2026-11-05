import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkRateFormula } from '../src/rate-formula/rate-formula.js';

// The deploy pipeline's seeding, exercised the way the migrate job runs it: psql and bash against
// a real database. It gets a scratch database of its own, because the demo set would otherwise
// land inside the roster-wide numbers the other e2e files assert on.
const SCRATCH = 'seed_profiles_spec';
const serverUrl = process.env.MIGRATOR_DB_URL ?? process.env.DATABASE_URL ?? '';

function urlOf(database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

function psql(database: string, sql: string): string {
  const run = spawnSync(
    'psql',
    [urlOf(database), '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim();
}

const maintenance = new URL(serverUrl || 'postgresql://x/postgres').pathname.slice(1);

function seedEnvironment(
  database: string,
  profile: string | undefined,
  refresh = false,
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MIGRATOR_DB_URL: urlOf(database),
    REFRESH_DEMO_DATA: String(refresh),
  };
  delete env.SEED_PROFILE;
  if (profile !== undefined) env.SEED_PROFILE = profile;
  return spawnSync('bash', ['prisma/ops/seed-environment.sh'], {
    encoding: 'utf8',
    env,
  });
}

const userCount = (where: string) =>
  Number(psql(SCRATCH, `select count(*) from users where ${where}`));
const formulaCount = () =>
  Number(psql(SCRATCH, 'select count(*) from rate_formula'));
const DEMO_USER = "email = 'rangga@example.com'";

describe('seeding by environment', () => {
  beforeAll(() => {
    psql(maintenance, `drop database if exists ${SCRATCH}`);
    psql(maintenance, `create database ${SCRATCH}`);
    const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: urlOf(SCRATCH),
        DIRECT_URL: urlOf(SCRATCH),
      },
    });
    if (migrate.status !== 0) throw new Error(migrate.stderr);
  }, 120_000);

  afterAll(() => {
    psql(maintenance, `drop database if exists ${SCRATCH}`);
  });

  it.each([[undefined], [''], ['prod']])(
    'fails the deploy on the unknown profile %j',
    (profile) => {
      const run = seedEnvironment(SCRATCH, profile);

      expect(run.status).not.toBe(0);
      expect(userCount('true')).toBe(0);
      expect(formulaCount()).toBe(0);
    },
  );

  it('gives the baseline profile the rate formula and no users', () => {
    const run = seedEnvironment(SCRATCH, 'baseline', true);

    expect(run.status).toBe(0);
    expect(userCount('true')).toBe(0);
    expect(formulaCount()).toBe(1);
  });

  it('seeds a formula the app itself would accept', () => {
    const tiers = (platform: string) =>
      JSON.parse(
        psql(
          SCRATCH,
          `select json_agg(json_build_object('threshold', threshold, 'bonus', bonus)
                           order by position)
           from performance_bonus_tiers where platform = '${platform}'`,
        ),
      ) as unknown;
    const metric = (platform: string) =>
      psql(
        SCRATCH,
        `select metric from performance_bonus_metrics where platform = '${platform}'`,
      );
    const [specificBonus, latePenaltyPerDay, maxPenaltyDays] = psql(
      SCRATCH,
      'select specific_bonus, late_penalty_per_day, max_penalty_days from rate_formula',
    )
      .split('|')
      .map(Number);

    const formula = checkRateFormula({
      specificBonus,
      latePenaltyPerDay,
      maxPenaltyDays,
      performanceBonus: {
        instagram: { metric: metric('instagram'), tiers: tiers('instagram') },
        tiktok: { metric: metric('tiktok'), tiers: tiers('tiktok') },
      },
    });

    expect(formula.performanceBonus.instagram.tiers.length).toBeGreaterThan(1);
    expect(formula.performanceBonus.tiktok.tiers.length).toBeGreaterThan(1);
  });

  it('never replaces a formula an admin has saved', () => {
    psql(SCRATCH, 'update rate_formula set specific_bonus = 1');
    psql(SCRATCH, "delete from performance_bonus_metrics where platform = 'tiktok'");

    const run = seedEnvironment(SCRATCH, 'baseline');

    expect(run.status).toBe(0);
    expect(psql(SCRATCH, 'select specific_bonus from rate_formula')).toBe('1');
    expect(psql(SCRATCH, 'select count(*) from performance_bonus_metrics')).toBe('1');
  });

  it('loads the demo set without the local admin account', () => {
    psql(SCRATCH, 'truncate rate_formula, performance_bonus_metrics cascade');

    const run = seedEnvironment(SCRATCH, 'demo');

    expect(run.status).toBe(0);
    expect(formulaCount()).toBe(1);
    expect(userCount(DEMO_USER)).toBe(1);
    expect(userCount('is_admin')).toBe(0);
    expect(Number(psql(SCRATCH, 'select count(*) from creators'))).toBe(12);
  });

  it('leaves the demo set alone when it is already there', () => {
    const before = psql(SCRATCH, 'select count(*) from contents');

    const run = seedEnvironment(SCRATCH, 'demo');

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('already present');
    expect(psql(SCRATCH, 'select count(*) from contents')).toBe(before);
  });

  it('refreshes only the demo set, keeping everyone else', () => {
    psql(
      SCRATCH,
      `insert into users (email, is_admin) values
         ('real-admin@tofly.test', true), ('hand-made@example.com', false)`,
    );
    const firstDemoUser = psql(SCRATCH, `select id from users where ${DEMO_USER}`);

    const run = seedEnvironment(SCRATCH, 'demo', true);

    expect(run.status).toBe(0);
    expect(psql(SCRATCH, `select id from users where ${DEMO_USER}`)).not.toBe(
      firstDemoUser,
    );
    expect(Number(psql(SCRATCH, 'select count(*) from creators'))).toBe(12);
    expect(
      userCount("email in ('real-admin@tofly.test', 'hand-made@example.com')"),
    ).toBe(2);
  });

  it('clears every row the demo set made', () => {
    const run = spawnSync(
      'psql',
      [urlOf(SCRATCH), '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', 'prisma/ops/clear-demo.sql'],
      { encoding: 'utf8' },
    );

    expect(run.status).toBe(0);
    expect(Number(psql(SCRATCH, 'select count(*) from creators'))).toBe(0);
    expect(userCount('true')).toBe(2);
  });

  it('gives local development the admin account as well as the demo set', () => {
    const run = spawnSync('npx', ['prisma', 'db', 'seed'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: urlOf(SCRATCH),
        DIRECT_URL: urlOf(SCRATCH),
      },
    });

    expect(run.status).toBe(0);
    expect(userCount("email = 'admin@tofly.id' and is_admin")).toBe(1);
    expect(Number(psql(SCRATCH, 'select count(*) from creators'))).toBe(12);
  });

  describe('on the production database', () => {
    // Created here and dropped only if this run created it: a real `tofly` on the server stops
    // the test instead of being touched.
    let created = false;

    beforeAll(() => {
      psql(maintenance, 'create database tofly');
      created = true;
    });

    afterAll(() => {
      if (created) psql(maintenance, 'drop database tofly');
    });

    it.each([['seed-demo'], ['clear-demo']])('%s refuses to run', (file) => {
      const run = spawnSync(
        'psql',
        [urlOf('tofly'), '-X', '-q', '-f', `prisma/ops/${file}.sql`],
        { encoding: 'utf8' },
      );

      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('refusing to touch the production database');
    });
  });
});
