import {
  GOOGLE_TOKEN_URL,
  GoogleTokenClient,
  TOKEN_TIMEOUT_MS,
  TokenExchangeError,
} from './google-token-client.js';

const CONFIG = {
  clientId: 'client-123.apps.googleusercontent.com',
  clientSecret: 'secret-xyz',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};
const CODE = '4/0AVG7fiQ-example-code';
const VERIFIER = 'v'.repeat(43);

function reply(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function client(response: Response | Error) {
  const fetchImpl = vi.fn<typeof fetch>();
  if (response instanceof Error) {
    fetchImpl.mockRejectedValue(response);
  } else {
    fetchImpl.mockResolvedValue(response);
  }
  return { fetchImpl, subject: new GoogleTokenClient(CONFIG, fetchImpl) };
}

describe('GoogleTokenClient.exchange', () => {
  it('posts the code with the PKCE verifier and returns the ID token', async () => {
    const { fetchImpl, subject } = client(
      reply(200, { id_token: 'header.payload.signature', access_token: 'x' }),
    );

    await expect(subject.exchange(CODE, VERIFIER)).resolves.toBe(
      'header.payload.signature',
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(GOOGLE_TOKEN_URL).toBe('https://oauth2.googleapis.com/token');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    });
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual(
      {
        grant_type: 'authorization_code',
        code: CODE,
        code_verifier: VERIFIER,
        client_id: CONFIG.clientId,
        client_secret: CONFIG.clientSecret,
        redirect_uri: CONFIG.redirectUri,
      },
    );
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up after the timeout instead of holding the request open', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { subject } = client(reply(200, { id_token: 'a.b.c' }));

    await subject.exchange(CODE, VERIFIER);

    expect(timeout).toHaveBeenCalledWith(TOKEN_TIMEOUT_MS);
    expect(TOKEN_TIMEOUT_MS).toBe(5000);
    timeout.mockRestore();
  });

  it.each([
    [
      'a rejected code',
      reply(400, { error: 'invalid_grant' }),
      'token endpoint answered 400',
    ],
    [
      'a server error',
      reply(503, 'unavailable'),
      'token endpoint answered 503',
    ],
    [
      'a body that is not JSON',
      reply(200, '<html>'),
      'token endpoint sent no JSON',
    ],
    [
      'no ID token',
      reply(200, { access_token: 'x' }),
      'token endpoint sent no ID token',
    ],
    [
      'an empty ID token',
      reply(200, { id_token: '' }),
      'token endpoint sent no ID token',
    ],
    [
      'a non-string ID token',
      reply(200, { id_token: 42 }),
      'token endpoint sent no ID token',
    ],
    [
      'a JSON body that is not an object',
      reply(200, 'null'),
      'token endpoint sent no ID token',
    ],
    [
      'a network failure or timeout',
      new Error('The operation was aborted due to timeout'),
      'token endpoint unreachable',
    ],
  ])('throws a TokenExchangeError on %s', async (_label, response, message) => {
    const { subject } = client(response);

    const attempt = subject.exchange(CODE, VERIFIER);

    await expect(attempt).rejects.toBeInstanceOf(TokenExchangeError);
    await expect(attempt).rejects.toThrow(message);
  });

  it('never puts the secret, the code or the response body in its error', async () => {
    const { subject } = client(
      reply(400, { error: 'invalid_grant', error_description: CODE }),
    );

    const error = await subject.exchange(CODE, VERIFIER).catch((e: Error) => e);

    expect(String(error)).not.toContain(CONFIG.clientSecret);
    expect(String(error)).not.toContain(CODE);
  });
});
