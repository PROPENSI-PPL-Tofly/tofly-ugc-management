import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Clock } from './clock.js';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, RateLimitGuard } from './rate-limit.guard.js';

function requestFrom(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  let now: number;
  let guard: RateLimitGuard;

  beforeEach(() => {
    now = Date.UTC(2026, 8, 16, 12, 0, 0);
    const clock: Clock = { now: () => new Date(now) };
    guard = new RateLimitGuard(clock);
  });

  it('allows requests up to the limit', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX; attempt += 1) {
      expect(guard.canActivate(requestFrom('10.0.0.1'))).toBe(true);
    }
  });

  it('rejects the request that goes over the limit', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX; attempt += 1) {
      guard.canActivate(requestFrom('10.0.0.1'));
    }

    expect(() => guard.canActivate(requestFrom('10.0.0.1'))).toThrow(HttpException);
  });

  it('answers an over-limit request with 429', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX; attempt += 1) {
      guard.canActivate(requestFrom('10.0.0.1'));
    }

    try {
      guard.canActivate(requestFrom('10.0.0.1'));
      expect.unreachable('the guard should have rejected this request');
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    }
  });

  it('counts each client separately', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX; attempt += 1) {
      guard.canActivate(requestFrom('10.0.0.1'));
    }

    expect(guard.canActivate(requestFrom('10.0.0.2'))).toBe(true);
  });

  it('lets the client through again once the window has passed', () => {
    for (let attempt = 0; attempt < RATE_LIMIT_MAX; attempt += 1) {
      guard.canActivate(requestFrom('10.0.0.1'));
    }

    now += RATE_LIMIT_WINDOW_MS + 1;

    expect(guard.canActivate(requestFrom('10.0.0.1'))).toBe(true);
  });

  it('treats a client with no address as one bucket rather than crashing', () => {
    const anonymous = { switchToHttp: () => ({ getRequest: () => ({}) }) } as ExecutionContext;

    expect(guard.canActivate(anonymous)).toBe(true);
  });

  it('forgets windows that have expired instead of growing without bound', () => {
    guard.canActivate(requestFrom('10.0.0.1'));
    guard.canActivate(requestFrom('10.0.0.2'));

    now += RATE_LIMIT_WINDOW_MS + 1;
    guard.canActivate(requestFrom('10.0.0.3'));

    expect(guard.trackedClients).toBe(1);
  });
});
