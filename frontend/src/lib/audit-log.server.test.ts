import type { AuditLogState } from "./audit-log";

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

// The browser's cookies as the server reads them; here whatever a test puts in.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
}));

import { loadAuditLogFilterOptions, loadAuditLogList } from "./audit-log.server";

const NO_FILTERS: AuditLogState = {
  page: 1,
  from: "",
  to: "",
  actor: [],
  category: [],
  action: [],
  creator: [],
};

const LIST = { items: [], page: 2, pageSize: 20, total: 21, totalPages: 2 };
const OPTIONS = {
  actors: [{ value: "system", label: "Sistem" }],
  creators: [{ value: "6f1c2b1e-0d7a-4a55-9a51-1f6c1c7d2e10", label: "Salsa Amelia" }],
};

function answer(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function askedUrl(fetch: ReturnType<typeof answer>): URL {
  return new URL(String(fetch.mock.calls[0][0]));
}

describe("the Log Aktivitas loaders", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks GET /audit-logs bare when no filter is set", async () => {
    const fetch = answer(LIST);

    await expect(loadAuditLogList(NO_FILTERS)).resolves.toEqual(LIST);

    const url = askedUrl(fetch);
    expect(url.pathname).toBe("/audit-logs");
    expect(url.search).toBe("");
  });

  it("asks for the filters and the page in the address, with the session and nothing cached", async () => {
    const fetch = answer(LIST);
    sessionCookies.push({ name: "__session", value: "abc" });

    await loadAuditLogList({
      ...NO_FILTERS,
      page: 2,
      from: "2026-11-01",
      to: "2026-11-20",
      actor: ["system"],
      category: ["pengaturan", "akses_admin"],
    });

    const { searchParams } = askedUrl(fetch);
    expect(Object.fromEntries(searchParams)).toEqual({
      page: "2",
      from: "2026-11-01",
      to: "2026-11-20",
      actor: "system",
      category: "pengaturan,akses_admin",
    });
    expect(fetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({ cache: "no-store", headers: { cookie: "__session=abc" } }),
    );
  });

  // A request that failed is not a log that is empty.
  it.each([400, 401, 403, 500])("throws when the list answers %i", async (status) => {
    answer({ message: "no" }, status);

    await expect(loadAuditLogList(NO_FILTERS)).rejects.toThrow(`HTTP ${status}`);
  });

  it("asks GET /audit-logs/filter-options for the Aktor and Creator choices", async () => {
    const fetch = answer(OPTIONS);

    await expect(loadAuditLogFilterOptions()).resolves.toEqual(OPTIONS);

    expect(askedUrl(fetch).pathname).toBe("/audit-logs/filter-options");
  });

  it("throws when the filter options cannot be read", async () => {
    answer({ message: "no" }, 500);

    await expect(loadAuditLogFilterOptions()).rejects.toThrow("HTTP 500");
  });
});
