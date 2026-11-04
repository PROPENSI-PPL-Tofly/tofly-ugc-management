import { disposableDatabaseUrl } from './login-code-lock-experiment.mjs';

const APP = 'postgresql://postgres:app-secret@127.0.0.1:54322/postgres';
const SCRATCH = 'postgresql://postgres:s3cret@127.0.0.1:54322/tofly_240';

function refusal(env: Record<string, string | undefined>): string {
  try {
    disposableDatabaseUrl(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the database to be refused');
}

describe('disposableDatabaseUrl', () => {
  it('accepts a loopback database that is neither the default nor the app’s own', () => {
    expect(
      disposableDatabaseUrl({
        LOGIN_CODE_EXPERIMENT_DATABASE_URL: SCRATCH,
        DATABASE_URL: APP,
      }),
    ).toBe(SCRATCH);
  });

  it('accepts localhost and IPv6 loopback too', () => {
    for (const host of ['localhost', '[::1]']) {
      const url = `postgres://u:p@${host}:5432/scratch`;
      expect(
        disposableDatabaseUrl({ LOGIN_CODE_EXPERIMENT_DATABASE_URL: url }),
      ).toBe(url);
    }
  });

  it('never falls back to DATABASE_URL: the experiment must be pointed somewhere on purpose', () => {
    expect(refusal({ DATABASE_URL: SCRATCH })).toMatch(
      /LOGIN_CODE_EXPERIMENT_DATABASE_URL is not set/,
    );
  });

  it.each([
    ['a remote host', 'postgresql://u:p@db.example.com:5432/scratch'],
    [
      'a Cloud SQL socket',
      'postgresql://u:p@localhost/scratch?host=/cloudsql/x',
    ],
    [
      'the default postgres database',
      'postgresql://u:p@127.0.0.1:54322/postgres',
    ],
    ['another protocol', 'mysql://u:p@127.0.0.1:3306/scratch'],
    ['something that is not a URL', 'not a url'],
  ])('refuses %s', (_, url) => {
    expect(refusal({ LOGIN_CODE_EXPERIMENT_DATABASE_URL: url })).toMatch(
      /Refusing/,
    );
  });

  it.each(['DATABASE_URL', 'DIRECT_URL'])(
    'refuses the database the app itself uses through %s',
    (name) => {
      expect(
        refusal({
          LOGIN_CODE_EXPERIMENT_DATABASE_URL:
            'postgresql://other:pw@localhost:54322/tofly_240',
          [name]: SCRATCH,
        }),
      ).toMatch(/Refusing/);
    },
  );

  it('refuses whenever NODE_ENV is production', () => {
    expect(
      refusal({
        LOGIN_CODE_EXPERIMENT_DATABASE_URL: SCRATCH,
        NODE_ENV: 'production',
      }),
    ).toMatch(/Refusing/);
  });

  it('never repeats the password in a refusal', () => {
    expect(
      refusal({
        LOGIN_CODE_EXPERIMENT_DATABASE_URL:
          'postgresql://u:hunter2@db.example.com:5432/scratch',
      }),
    ).not.toContain('hunter2');
  });
});
