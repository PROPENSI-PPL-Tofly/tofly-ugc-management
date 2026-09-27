import { ForbiddenException } from '@nestjs/common';
import { assertSameOrigin, type OriginRequest } from './same-origin.js';

const REJECTED_HEADERS: Array<[string, OriginRequest['headers']]> = [
  ['missing Origin', {}],
  ['non-string Origin', { origin: ['https://tofly.example'] }],
  ['invalid Origin', { origin: 'not an origin' }],
  [
    'cross-origin Fetch Metadata',
    { origin: 'https://tofly.example', 'sec-fetch-site': 'cross-site' },
  ],
  [
    'same-site sibling request',
    { origin: 'https://evil.tofly.example', 'sec-fetch-site': 'same-site' },
  ],
  [
    'unexpected configured origin',
    { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
  ],
];

describe('assertSameOrigin', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('allows a same-origin browser mutation when its origin matches the frontend', () => {
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000/path');
    const request: OriginRequest = {
      headers: {
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'same-origin',
      },
    };

    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it('allows a same-origin request with no Fetch Metadata when the origin is configured', () => {
    vi.stubEnv('FRONTEND_URL', 'https://tofly.example');

    expect(() =>
      assertSameOrigin({ headers: { origin: 'https://tofly.example' } }),
    ).not.toThrow();
  });

  it.each(REJECTED_HEADERS)('rejects %s', (_label, headers) => {
    vi.stubEnv('FRONTEND_URL', 'https://tofly.example');
    expect(() => assertSameOrigin({ headers })).toThrow(ForbiddenException);
  });

  it('requires same-origin Fetch Metadata when there is no configured frontend origin', () => {
    vi.stubEnv('FRONTEND_URL', '');

    expect(() =>
      assertSameOrigin({
        headers: { origin: 'https://tofly.example', 'sec-fetch-site': 'same-origin' },
      }),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin({ headers: { origin: 'https://tofly.example' } }),
    ).toThrow(ForbiddenException);
  });

  it('rejects an invalid configured frontend URL', () => {
    vi.stubEnv('FRONTEND_URL', 'invalid');
    expect(() =>
      assertSameOrigin({
        headers: { origin: 'https://tofly.example', 'sec-fetch-site': 'same-origin' },
      }),
    ).toThrow(ForbiddenException);
  });
});
