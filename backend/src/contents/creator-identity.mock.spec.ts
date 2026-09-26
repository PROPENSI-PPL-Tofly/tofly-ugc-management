import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import {
  MOCK_CREATOR_HEADER,
  MockCreatorGuard,
  mockCreatorId,
  mockCurrentCreatorId,
  type MockCreatorRequest,
} from './creator-identity.mock.js';

const ID = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const ON = { DEV_AUTH_ENABLED: 'true' };

function contextFor(request: MockCreatorRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function unauthorized(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    return (error as UnauthorizedException).getResponse();
  }
  throw new Error('expected a 401');
}

const UNAUTHENTICATED = {
  code: 'UNAUTHENTICATED',
  message: 'Silakan masuk terlebih dahulu',
};

describe('mockCreatorId', () => {
  it('takes the header, lower-cased, when dev auth is on', () => {
    expect(mockCreatorId(ID.toUpperCase(), ON)).toBe(ID);
  });

  it.each([
    ['unset', {}],
    ['anything but "true"', { DEV_AUTH_ENABLED: '1' }],
    ['on in production', { ...ON, NODE_ENV: 'production' }],
  ])('resolves nobody when dev auth is %s', (_label, env) => {
    expect(mockCreatorId(ID, env)).toBeUndefined();
  });

  it.each([
    ['no header', undefined],
    ['a repeated header', [ID, ID]],
    // String([ID]) is ID, so the UUID pattern alone would let a one-item list through.
    ['a one-item header list', [ID]],
    ['a non-UUID', 'creator-1'],
    ['a UUID with a trailing payload', `${ID}' OR '1'='1`],
    ['a UUID with a leading payload', `x${ID}`],
  ])('resolves nobody from %s (OWASP A03, A07)', (_label, header) => {
    expect(mockCreatorId(header, ON)).toBeUndefined();
  });
});

describe('MockCreatorGuard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records the claimed creator on the request', () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    const request: MockCreatorRequest = {
      headers: { [MOCK_CREATOR_HEADER]: ID },
    };

    expect(new MockCreatorGuard().canActivate(contextFor(request))).toBe(true);
    expect(request.creatorId).toBe(ID);
  });

  it('refuses a request that names nobody', () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');

    expect(
      unauthorized(() =>
        new MockCreatorGuard().canActivate(contextFor({ headers: {} })),
      ),
    ).toEqual(UNAUTHENTICATED);
  });

  it('refuses everyone while dev auth is off', () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'false');

    expect(
      unauthorized(() =>
        new MockCreatorGuard().canActivate(
          contextFor({ headers: { [MOCK_CREATOR_HEADER]: ID } }),
        ),
      ),
    ).toEqual(UNAUTHENTICATED);
  });
});

describe('mockCurrentCreatorId', () => {
  it('reads the creator the guard recorded', () => {
    expect(
      mockCurrentCreatorId(
        undefined,
        contextFor({ headers: {}, creatorId: ID }),
      ),
    ).toBe(ID);
  });

  it('fails closed on a route that forgot the guard', () => {
    expect(
      unauthorized(() =>
        mockCurrentCreatorId(undefined, contextFor({ headers: {} })),
      ),
    ).toEqual(UNAUTHENTICATED);
  });
});
