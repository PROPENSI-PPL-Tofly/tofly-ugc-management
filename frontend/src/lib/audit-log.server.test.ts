import type { AuditLogState } from "./audit-log";
import { loadAuditLog } from "./audit-log.server";

const NO_FILTERS: AuditLogState = {
  page: 1,
  from: "",
  to: "",
  actor: [],
  category: [],
  action: [],
  creator: [],
};

describe("loadAuditLog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers the sample rows in development, until the API of 23.6 exists", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const loaded = await loadAuditLog(NO_FILTERS);

    expect(loaded.list.items).toHaveLength(20);
    expect(loaded.actors.length).toBeGreaterThan(0);
    expect(loaded.creators.length).toBeGreaterThan(0);
  });

  // Made-up rows on a deployed app would read as a real record of who did what.
  it.each(["production", "test"])("never answers sample rows in %s", async (env) => {
    vi.stubEnv("NODE_ENV", env);

    await expect(loadAuditLog(NO_FILTERS)).rejects.toThrow("not available");
  });
});
