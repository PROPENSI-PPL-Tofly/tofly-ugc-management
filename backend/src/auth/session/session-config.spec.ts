import {
  DEFAULT_SESSION_ABSOLUTE_LIFETIME_MS,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
  sessionConfig,
} from './session-config.js';

describe('sessionConfig', () => {
  it('uses the approved idle and absolute lifetime defaults', () => {
    expect(sessionConfig({})).toEqual({
      idleTimeoutMs: DEFAULT_SESSION_IDLE_TIMEOUT_MS,
      absoluteLifetimeMs: DEFAULT_SESSION_ABSOLUTE_LIFETIME_MS,
    });
  });

  it('uses the defaults for empty override values', () => {
    expect(
      sessionConfig({
        SESSION_IDLE_TIMEOUT_MS: '',
        SESSION_ABSOLUTE_LIFETIME_MS: '',
      }),
    ).toEqual({
      idleTimeoutMs: DEFAULT_SESSION_IDLE_TIMEOUT_MS,
      absoluteLifetimeMs: DEFAULT_SESSION_ABSOLUTE_LIFETIME_MS,
    });
  });

  it('reads positive integer millisecond overrides', () => {
    expect(
      sessionConfig({
        SESSION_IDLE_TIMEOUT_MS: '60000',
        SESSION_ABSOLUTE_LIFETIME_MS: '3600000',
      }),
    ).toEqual({ idleTimeoutMs: 60000, absoluteLifetimeMs: 3600000 });
  });

  it.each(['0', '-2', '1.5', 'nope', '9007199254740992'])(
    'rejects an invalid idle timeout (%s)',
    (value) => {
      expect(() => sessionConfig({ SESSION_IDLE_TIMEOUT_MS: value })).toThrow(
        'SESSION_IDLE_TIMEOUT_MS must be a positive integer',
      );
    },
  );

  it('rejects an invalid absolute lifetime', () => {
    expect(() =>
      sessionConfig({ SESSION_ABSOLUTE_LIFETIME_MS: 'invalid' }),
    ).toThrow('SESSION_ABSOLUTE_LIFETIME_MS must be a positive integer');
  });

  it('does not allow an idle timeout longer than the absolute lifetime', () => {
    expect(() =>
      sessionConfig({
        SESSION_IDLE_TIMEOUT_MS: '2000',
        SESSION_ABSOLUTE_LIFETIME_MS: '1000',
      }),
    ).toThrow('SESSION_IDLE_TIMEOUT_MS cannot exceed SESSION_ABSOLUTE_LIFETIME_MS');
  });
});
