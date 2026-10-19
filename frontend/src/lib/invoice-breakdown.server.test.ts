import { RANGGA_ID, RAW_RANGGA_DETAIL } from "./invoice-api.fixture";

const CONTRACT_ID = RAW_RANGGA_DETAIL.contract.id;

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
}));

// Who is asking is read from the session on the server; here it is whatever a test says.
vi.mock("./session.server", () => ({ currentRole: vi.fn() }));

import { loadInvoiceBreakdown } from "./invoice-breakdown.server";
import { currentRole } from "./session.server";

const asRole = (role: "admin" | "creator" | null) => vi.mocked(currentRole).mockResolvedValue(role);

function answer(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("loadInvoiceBreakdown", () => {
  beforeEach(() => {
    asRole("admin");
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    sessionCookies.push({ name: "__session", value: "abc" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks GET /invoices/:creatorId with the admin's session and reads the answer into the popup's names", async () => {
    const fetch = answer(RAW_RANGGA_DETAIL);

    const breakdown = await loadInvoiceBreakdown(RANGGA_ID, CONTRACT_ID);

    expect(fetch).toHaveBeenCalledWith(`http://localhost:3001/invoices/${RANGGA_ID}?contract=${CONTRACT_ID}`, {
      cache: "no-store",
      headers: { cookie: "__session=abc" },
    });
    expect(breakdown).toMatchObject({
      creatorName: "Rangga Pratama",
      fixed: { total: 500000 },
      penalty: { total: 150000 },
    });
  });

  it("answers null for a creator the backend has no invoice for", async () => {
    answer({ code: "INVOICE_NOT_FOUND" }, 404);

    await expect(loadInvoiceBreakdown(RANGGA_ID, CONTRACT_ID)).resolves.toBeNull();
  });

  it.each([401, 403, 500])(
    "throws on HTTP %i, so the popup offers to try again",
    async (status) => {
      answer({}, status);

      await expect(loadInvoiceBreakdown(RANGGA_ID, CONTRACT_ID)).rejects.toThrow(
        `Loading the invoice breakdown failed with HTTP ${status}`,
      );
    },
  );

  describe("refuses without asking the backend", () => {
    it.each(["__proto__", "constructor", "", "../creators", "creator-rangga", `${RANGGA_ID}/x`])(
      "an id that is not a UUID, such as %j",
      async (creatorId) => {
        const fetch = answer(RAW_RANGGA_DETAIL);

        await expect(loadInvoiceBreakdown(creatorId, CONTRACT_ID)).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    // OWASP Top 10:2025 A05 (Injection): the contract id goes into the query string, so only a
    // UUID is ever sent.
    it.each(["", "x&contract=y", "../creators", 42])(
      "a contract id that is not a UUID, such as %j",
      async (contractId) => {
        const fetch = answer(RAW_RANGGA_DETAIL);

        await expect(loadInvoiceBreakdown(RANGGA_ID, contractId as string)).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it("an id that is not text, as anything can be posted to a server action", async () => {
      const fetch = answer(RAW_RANGGA_DETAIL);

      await expect(loadInvoiceBreakdown(42 as unknown as string, CONTRACT_ID)).resolves.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([["creator"], [null]] as const)(
      "anyone who is not an admin (%s)",
      async (role) => {
        asRole(role);
        const fetch = answer(RAW_RANGGA_DETAIL);

        await expect(loadInvoiceBreakdown(RANGGA_ID, CONTRACT_ID)).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
      },
    );
  });

  it("throws when BACKEND_URL is missing", async () => {
    vi.stubEnv("BACKEND_URL", undefined);

    await expect(loadInvoiceBreakdown(RANGGA_ID, CONTRACT_ID)).rejects.toThrow("BACKEND_URL is not configured");
  });
});
