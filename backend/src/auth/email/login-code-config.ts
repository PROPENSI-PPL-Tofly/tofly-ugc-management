type Env = Record<string, string | undefined>;

/** Long enough that the key cannot be guessed from a stolen hash; the code alone is six digits. */
export const MIN_LOGIN_CODE_SECRET_LENGTH = 32;

/** The HMAC key for login codes, or undefined while it is missing or too short to trust. */
export function loginCodeSecret(env: Env): string | undefined {
  const secret = env.LOGIN_CODE_SECRET?.trim() ?? '';
  return secret.length >= MIN_LOGIN_CODE_SECRET_LENGTH ? secret : undefined;
}

/** Fails the boot like the database settings do; development and tests may run without it. */
export function requireLoginCodeSecretInProduction(env: Env): void {
  if (env.NODE_ENV === 'production' && loginCodeSecret(env) === undefined) {
    throw new Error('Missing required env var: LOGIN_CODE_SECRET');
  }
}
