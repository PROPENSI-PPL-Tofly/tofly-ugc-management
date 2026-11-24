import {
  captureRouterTransitionStart,
  feedbackIntegration,
  init,
  replayIntegration,
} from "@sentry/nextjs";

// Import-time SDK wiring: mock the SDK so the test sees the options we pass, not real events.
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => "replay"),
  feedbackIntegration: vi.fn(() => "feedback"),
  captureRouterTransitionStart: vi.fn(),
}));

const DSN = "https://public@example.invalid/1";

async function loadClient() {
  vi.resetModules();
  return import("./instrumentation-client");
}

describe("instrumentation-client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("captures every trace and both replay kinds in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);

    const client = await loadClient();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        tracesSampleRate: 1.0,
        integrations: ["replay", "feedback"],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      }),
    );
    expect(replayIntegration).toHaveBeenCalledOnce();
    expect(feedbackIntegration).toHaveBeenCalledOnce();
    expect(client.onRouterTransitionStart).toBe(captureRouterTransitionStart);
  });

  it("samples traces at 10% in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);

    await loadClient();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: DSN, tracesSampleRate: 0.1 }),
    );
  });
});
