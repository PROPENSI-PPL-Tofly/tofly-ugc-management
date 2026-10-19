import { RAW_MY_PAID, RAW_MY_RUNNING } from "./creator-invoice-api.fixture";
import { CreatorInvoicesError } from "./creator-invoice";

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

// The browser's cookies as the server reads them; here whatever a test puts in.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
}));

import { fetchMyInvoices } from "./creator-invoice.server";

function answer(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("fetchMyInvoices", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks GET /me/invoices with the session and nothing cached, naming no creator", async () => {
    const fetch = answer({ items: [] });
    sessionCookies.push({ name: "__session", value: "abc" });

    await fetchMyInvoices();

    // Whose invoices these are is the backend's to read from the session (OWASP A01).
    expect(fetch).toHaveBeenCalledWith("http://localhost:3001/me/invoices", {
      cache: "no-store",
      headers: { cookie: "__session=abc" },
    });
  });

  it("hands the page the creator's invoices in the page's own names", async () => {
    answer({ items: [RAW_MY_RUNNING, RAW_MY_PAID] });

    const invoices = await fetchMyInvoices();

    expect(invoices.map((invoice) => [invoice.periodNumber, invoice.status])).toEqual([
      [2, "accruing"],
      [1, "paid"],
    ]);
  });

  it.each([401, 403, 500])(
    "throws with HTTP %i, so the page can tell a signed-out creator from a failed load",
    async (status) => {
      answer({ code: "ANY" }, status);

      await expect(fetchMyInvoices()).rejects.toEqual(new CreatorInvoicesError(status));
    },
  );

  it("throws as a bad gateway when a 200 carries a body the page cannot render", async () => {
    answer({ items: [{ contract: null }] });

    const failure = await fetchMyInvoices().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CreatorInvoicesError);
    expect((failure as CreatorInvoicesError).status).toBe(502);
  });

  it("throws as a bad gateway when a 200 carries no JSON at all", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>", { status: 200 }));

    await expect(fetchMyInvoices()).rejects.toEqual(new CreatorInvoicesError(502));
  });

  it("throws when BACKEND_URL is missing, before asking anyone", async () => {
    vi.stubEnv("BACKEND_URL", undefined);
    const fetch = answer({ items: [] });

    await expect(fetchMyInvoices()).rejects.toThrow("BACKEND_URL is not configured");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("CreatorInvoicesError", () => {
  it("carries the status and says what failed", () => {
    const error = new CreatorInvoicesError(500);

    expect(error.status).toBe(500);
    expect(error.message).toBe("Loading your invoices failed with HTTP 500");
    expect(error.name).toBe("CreatorInvoicesError");
  });
});
