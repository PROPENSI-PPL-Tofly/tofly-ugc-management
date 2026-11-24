import { captureRequestError } from "@sentry/nextjs";

const calls = vi.hoisted(() => ({ server: 0, edge: 0 }));

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
// The config files are boot wiring of their own; these tests only check that register()
// imports the right one for the runtime Next is using.
vi.mock("./sentry.server.config", () => {
  calls.server += 1;
  return {};
});
vi.mock("./sentry.edge.config", () => {
  calls.edge += 1;
  return {};
});

async function loadInstrumentation() {
  vi.resetModules();
  return import("./instrumentation");
}

describe("instrumentation.ts — Next server registration", () => {
  beforeEach(() => {
    calls.server = 0;
    calls.edge = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers the Node SDK in the nodejs runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const instrumentation = await loadInstrumentation();

    await instrumentation.register();

    expect(calls.server).toBe(1);
    expect(calls.edge).toBe(0);
  });

  it("registers the edge SDK in the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const instrumentation = await loadInstrumentation();

    await instrumentation.register();

    expect(calls.server).toBe(0);
    expect(calls.edge).toBe(1);
  });

  it("registers nothing in an unknown runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "other");
    const instrumentation = await loadInstrumentation();

    await instrumentation.register();

    expect(calls.server).toBe(0);
    expect(calls.edge).toBe(0);
  });

  it("forwards server errors to Sentry's request-error hook", async () => {
    const instrumentation = await loadInstrumentation();

    expect(instrumentation.onRequestError).toBe(captureRequestError);
  });
});
