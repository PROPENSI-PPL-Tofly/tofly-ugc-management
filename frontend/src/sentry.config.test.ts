import { init } from "@sentry/nextjs";

// These files call Sentry.init at import time. Mock the SDK so the test measures our configuration
// (DSN + sample rate) rather than sending events.
vi.mock("@sentry/nextjs", () => ({ init: vi.fn() }));

const DSN = "https://public@example.invalid/1";

const CONFIGS = [
  ["server", "./sentry.server.config"],
  ["edge", "./sentry.edge.config"],
] as const;

describe("Sentry server/edge boot configs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(CONFIGS)("%s config captures every trace in development", async (_name, path) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    vi.resetModules();

    await import(path);

    expect(init).toHaveBeenCalledWith({ dsn: DSN, tracesSampleRate: 1.0 });
  });

  it.each(CONFIGS)("%s config samples 10% of traces in production", async (_name, path) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    vi.resetModules();

    await import(path);

    expect(init).toHaveBeenCalledWith({ dsn: DSN, tracesSampleRate: 0.1 });
  });
});
