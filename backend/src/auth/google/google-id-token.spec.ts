import {
  createLocalJWKSet,
  createRemoteJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';
import {
  GOOGLE_ISSUERS,
  GOOGLE_JWKS_URL,
  GoogleIdTokenVerifier,
  IdTokenError,
  JWKS_TIMEOUT_MS,
  googleKeys,
} from './google-id-token.js';

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return { ...actual, createRemoteJWKSet: vi.fn(actual.createRemoteJWKSet) };
});

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const NONCE = 'n'.repeat(43);
const SUB = '110169484474386276334';
const EMAIL = 'dina@example.com';
const KID = 'google-key-1';

type Signer = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let googleKey: Signer;
let strangerKey: Signer;
let jwks: JSONWebKeySet;

beforeAll(async () => {
  const google = await generateKeyPair('RS256', { extractable: true });
  googleKey = google.privateKey;
  strangerKey = (await generateKeyPair('RS256')).privateKey;
  jwks = {
    keys: [{ ...(await exportJWK(google.publicKey)), kid: KID, alg: 'RS256' }],
  };
});

/** An ID token as Google issues one for this client and flow, with `claims` changed. */
function idToken(
  claims: Partial<Record<keyof JWTPayload | 'email_verified', unknown>> = {},
  key: Signer = googleKey,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = Object.fromEntries(
    Object.entries({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: SUB,
      email: EMAIL,
      email_verified: true,
      nonce: NONCE,
      iat: now,
      exp: now + 3600,
      ...claims,
    }).filter(([, value]) => value !== undefined),
  );
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .sign(key);
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function verifier() {
  return new GoogleIdTokenVerifier(CLIENT_ID, createLocalJWKSet(jwks));
}

describe('GoogleIdTokenVerifier.verify', () => {
  it('returns who signed in for a token Google signed for this client and flow', async () => {
    await expect(verifier().verify(await idToken(), NONCE)).resolves.toEqual({
      sub: SUB,
      email: EMAIL,
    });
  });

  it('lower-cases the email so the whitelist lookup does not depend on its case', async () => {
    const token = await idToken({ email: 'Dina.Putri@Example.COM' });

    await expect(verifier().verify(token, NONCE)).resolves.toEqual({
      sub: SUB,
      email: 'dina.putri@example.com',
    });
  });

  // Google documents both spellings of its issuer.
  it('accepts the issuer without its scheme', async () => {
    const token = await idToken({ iss: 'accounts.google.com' });

    await expect(verifier().verify(token, NONCE)).resolves.toMatchObject({
      sub: SUB,
    });
  });

  it.each([
    [
      'signed by a key Google does not publish',
      () => idToken({}, strangerKey),
      'ID token rejected: ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
    ],
    [
      'issued to another client (audience)',
      () => idToken({ aud: 'other-app.apps.googleusercontent.com' }),
      'ID token rejected: ERR_JWT_CLAIM_VALIDATION_FAILED (aud)',
    ],
    [
      'issued by someone other than Google',
      () => idToken({ iss: 'https://evil.example.com' }),
      'ID token rejected: ERR_JWT_CLAIM_VALIDATION_FAILED (iss)',
    ],
    [
      'expired',
      () => idToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
      'ID token rejected: ERR_JWT_EXPIRED (exp)',
    ],
    [
      'without an expiry',
      () => idToken({ exp: undefined }),
      'ID token rejected: ERR_JWT_CLAIM_VALIDATION_FAILED (exp)',
    ],
    [
      'without a subject',
      () => idToken({ sub: undefined }),
      'ID token rejected: ERR_JWT_CLAIM_VALIDATION_FAILED (sub)',
    ],
    [
      'unsigned (alg none)',
      () =>
        Promise.resolve(
          `${base64url({ alg: 'none' })}.${base64url({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: SUB, email: EMAIL, email_verified: true, nonce: NONCE })}.`,
        ),
      'ID token rejected: ERR_JOSE_ALG_NOT_ALLOWED',
    ],
    [
      'signed with a shared secret (HS256)',
      () =>
        new SignJWT({ sub: SUB, email: EMAIL, nonce: NONCE })
          .setProtectedHeader({ alg: 'HS256', kid: KID })
          .sign(new TextEncoder().encode('s'.repeat(32))),
      'ID token rejected: ERR_JOSE_ALG_NOT_ALLOWED',
    ],
    [
      'not a JWT at all',
      () => Promise.resolve('not-a-token'),
      'ID token rejected: ERR_JWS_INVALID',
    ],
    [
      'issued for another sign-in (nonce)',
      () => idToken({ nonce: 'x'.repeat(43) }),
      'ID token nonce does not match this sign-in',
    ],
    [
      'without a nonce',
      () => idToken({ nonce: undefined }),
      'ID token nonce does not match this sign-in',
    ],
    [
      'for an email Google has not verified',
      () => idToken({ email_verified: false }),
      'ID token email is not verified',
    ],
    [
      'without email_verified',
      () => idToken({ email_verified: undefined }),
      'ID token email is not verified',
    ],
    [
      'with email_verified as a string',
      () => idToken({ email_verified: 'true' }),
      'ID token email is not verified',
    ],
    [
      'without an email',
      () => idToken({ email: undefined }),
      'ID token has no email',
    ],
    [
      'with an email that is not a string',
      () => idToken({ email: ['dina@example.com'] }),
      'ID token has no email',
    ],
    [
      'with an empty email',
      () => idToken({ email: '' }),
      'ID token has no email',
    ],
  ])('rejects a token %s', async (_label, token, message) => {
    const attempt = verifier().verify(await token(), NONCE);

    await expect(attempt).rejects.toBeInstanceOf(IdTokenError);
    await expect(attempt).rejects.toMatchObject({
      name: 'IdTokenError',
      message,
    });
  });

  it("fails closed when Google's keys cannot be fetched", async () => {
    const subject = new GoogleIdTokenVerifier(CLIENT_ID, () =>
      Promise.reject(new errors.JWKSTimeout()),
    );

    await expect(subject.verify(await idToken(), NONCE)).rejects.toMatchObject({
      name: 'IdTokenError',
      message: 'ID token rejected: ERR_JWKS_TIMEOUT',
    });
  });

  it('fails closed on an error that is not from token checking', async () => {
    const subject = new GoogleIdTokenVerifier(CLIENT_ID, () =>
      Promise.reject(new Error(`boom ${EMAIL}`)),
    );

    await expect(subject.verify(await idToken(), NONCE)).rejects.toMatchObject({
      name: 'IdTokenError',
      message: 'ID token rejected: unknown error',
    });
  });

  // The reason goes to the server log, so it must not carry the token or who it belongs to.
  it('never puts the token or the email in its error', async () => {
    const token = await idToken({ aud: 'other-app', nonce: EMAIL });

    const error = await verifier()
      .verify(token, NONCE)
      .catch((e: Error) => e);

    expect(String(error)).not.toContain(token);
    expect(String(error)).not.toContain(EMAIL);
    expect(String(error)).not.toContain('other-app');
  });
});

describe('googleKeys', () => {
  it("reads Google's published signing keys with a timeout", () => {
    googleKeys();

    expect(createRemoteJWKSet).toHaveBeenCalledWith(new URL(GOOGLE_JWKS_URL), {
      timeoutDuration: JWKS_TIMEOUT_MS,
    });
    expect(GOOGLE_JWKS_URL).toBe('https://www.googleapis.com/oauth2/v3/certs');
    expect(JWKS_TIMEOUT_MS).toBe(5000);
  });

  it('is the default key source of the verifier', () => {
    vi.mocked(createRemoteJWKSet).mockClear();

    new GoogleIdTokenVerifier(CLIENT_ID);

    expect(createRemoteJWKSet).toHaveBeenCalledOnce();
  });

  it('trusts only the issuers Google documents', () => {
    expect(GOOGLE_ISSUERS).toEqual([
      'https://accounts.google.com',
      'accounts.google.com',
    ]);
  });
});
