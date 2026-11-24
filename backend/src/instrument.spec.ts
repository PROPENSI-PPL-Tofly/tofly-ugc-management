import { init } from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// The boot file calls Sentry.init at import time. Mock the SDK so importing it here exercises
// only our wiring — which DSN, which sample rates, which integration — without sending events.
vi.mock('@sentry/nestjs', () => ({ init: vi.fn() }));
vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => 'profiling-integration'),
}));

const DSN = 'https://public@example.invalid/1';

async function loadInstrument() {
  vi.resetModules();
  await import('./instrument.js');
}

describe('instrument.ts — Sentry boot wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('samples everything with profiling in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SENTRY_DSN', DSN);

    await loadInstrument();

    expect(nodeProfilingIntegration).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'development',
        tracesSampleRate: 1.0,
        profileSessionSampleRate: 1.0,
        profileLifecycle: 'trace',
        integrations: ['profiling-integration'],
      }),
    );
  });

  it('samples lightly in production to protect the quota', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', DSN);

    await loadInstrument();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        tracesSampleRate: 0.1,
        profileSessionSampleRate: 0.1,
      }),
    );
  });

  it('stays a no-op when no DSN is configured', async () => {
    vi.stubEnv('SENTRY_DSN', undefined as unknown as string);

    await loadInstrument();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: undefined }),
    );
  });

  it('labels the environment as development when NODE_ENV is unset', async () => {
    vi.stubEnv('NODE_ENV', undefined as unknown as string);

    await loadInstrument();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'development', tracesSampleRate: 1.0 }),
    );
  });
});
