import { AMOUNT_INVALID, REASON_EMPTY } from "./invoice-adjustment";

const { sessionCookies, incoming } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
  // The headers the browser sent with the server action's own POST.
  incoming: { current: {} as Record<string, string> },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
  headers: vi.fn(async () => new Headers(incoming.current)),
}));

vi.mock("./session.server", () => ({ currentRole: vi.fn() }));

import { addInvoiceAdjustment, finalizeInvoice } from "./invoice-actions.server";
import { currentRole } from "./session.server";

const CONTRACT = "11111111-1111-4111-8111-111111111111";
const DRAFT = { amount: "125000", reason: "Koreksi kelebihan tagihan" };

const asRole = (role: "admin" | "creator" | null) =>
  vi.mocked(currentRole).mockResolvedValue(role);

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("addInvoiceAdjustment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    sessionCookies.push({ name: "__session", value: "abc" });
    asRole("admin");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(201, {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("sends the adjustment to the contract's invoice with the browser's session", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);

    await expect(addInvoiceAdjustment(CONTRACT, DRAFT)).resolves.toEqual({ ok: true });

    expect(fetchSpy).toHaveBeenCalledWith(
      `http://localhost:3001/invoices/${CONTRACT}/adjustments`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ amount: 125000, reason: "Koreksi kelebihan tagihan" }),
      }),
    );
  });

  it("trims what the form should not send, as the backend trims it", async () => {
    await addInvoiceAdjustment(CONTRACT, { amount: " 200000 ", reason: "  Koreksi  " });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ amount: 200000, reason: "Koreksi" }) }),
    );
  });

  it.each([
    { amount: "0", reason: "Koreksi" },
    { amount: "abc", reason: "Koreksi" },
    { amount: "125000", reason: "   " },
  ])("checks the draft in the backend's words before anything is sent (%j)", async (draft) => {
    vi.mocked(globalThis.fetch).mockClear();

    const outcome = await addInvoiceAdjustment(CONTRACT, draft);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toBe("Data penyesuaian tidak valid");
      expect(outcome.fieldErrors).toMatchObject({
        ...(draft.amount === "125000" ? { reason: REASON_EMPTY } : { amount: AMOUNT_INVALID }),
      });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses an id the API would never take, without asking it", async () => {
    vi.mocked(globalThis.fetch).mockClear();

    await expect(addInvoiceAdjustment("not-a-uuid", DRAFT)).resolves.toMatchObject({
      ok: false,
      code: "INVOICE_NOT_FOUND",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses anyone but an admin, without asking (OWASP A01)", async () => {
    asRole("creator");
    vi.mocked(globalThis.fetch).mockClear();

    await expect(addInvoiceAdjustment(CONTRACT, DRAFT)).resolves.toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["INVOICE_FINALIZED", "Invoice sudah difinalisasi"],
    ["INVOICE_DATA_INCOMPLETE", "Invoice belum bisa difinalisasi: masih ada komponen yang menunggu formula rate."],
  ])("reads a %s refusal for the admin, who keeps the form open", async (code, message) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(reply(409, { code, message: "server words" }));

    await expect(addInvoiceAdjustment(CONTRACT, DRAFT)).resolves.toEqual({
      ok: false,
      code,
      message,
    });
  });

  it("hands back the field errors of a 422 the client check did not catch", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      reply(422, {
        message: "Data penyesuaian tidak valid",
        errors: { amount: AMOUNT_INVALID },
      }),
    );

    await expect(addInvoiceAdjustment(CONTRACT, DRAFT)).resolves.toEqual({
      ok: false,
      code: "INVALID",
      message: "Data penyesuaian tidak valid",
      fieldErrors: { amount: AMOUNT_INVALID },
    });
  });

  it("lets an unknown refusal stand in its own words", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      reply(409, { code: "SOMETHING_ELSE", message: "Tidak bisa." }),
    );

    await expect(addInvoiceAdjustment(CONTRACT, DRAFT)).resolves.toEqual({
      ok: false,
      code: "SOMETHING_ELSE",
      message: "Tidak bisa.",
    });
  });

  it("says nothing of a server that failed, only that it could not answer (OWASP A05)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      reply(500, { message: "NullPointerException at /srv/app" }),
    );

    await expect(addInvoiceAdjustment(CONTRACT, DRAFT)).resolves.toMatchObject({
      ok: false,
      message: "Permintaan tidak dapat diproses. Coba lagi.",
    });
  });

  it("falls back to a plain refusal when the error body is not readable", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("<html>", { status: 502 }));

    await expect(addInvoiceAdjustment(CONTRACT, DRAFT)).resolves.toMatchObject({
      ok: false,
      message: "Permintaan tidak dapat diproses. Coba lagi.",
    });
  });
});

// The backend refuses a state change without the browser's Origin (assertSameOrigin). A server
// action reaches it from the Next server, so it passes on what the browser sent, as the /api
// proxy does; Next has already refused an action whose Origin does not match its host.
describe("the browser's origin on an invoice move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    sessionCookies.push({ name: "__session", value: "abc" });
    asRole("admin");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(201, {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
    incoming.current = {};
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): the same-origin check holds end to end.
  it("forwards the Origin and Sec-Fetch-Site the browser sent", async () => {
    incoming.current = { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" };

    await finalizeInvoice(CONTRACT);
    await addInvoiceAdjustment(CONTRACT, DRAFT);

    for (const [, init] of vi.mocked(globalThis.fetch).mock.calls) {
      expect(init?.headers).toMatchObject({
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        cookie: "__session=abc",
      });
    }
  });

  it("invents no Origin the browser did not send, leaving the backend to refuse", async () => {
    await finalizeInvoice(CONTRACT);

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(init?.headers).not.toHaveProperty("origin");
    expect(init?.headers).not.toHaveProperty("sec-fetch-site");
  });
});

describe("finalizeInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    sessionCookies.push({ name: "__session", value: "abc" });
    asRole("admin");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(200, {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks the contract's invoice to freeze, with the browser's session", async () => {
    await expect(finalizeInvoice(CONTRACT)).resolves.toEqual({ ok: true });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      `http://localhost:3001/invoices/${CONTRACT}/finalize`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ acceptPendingBonus: false }) }),
    );
  });

  it("says the admin accepted freezing a bonus still waiting for data, when they did", async () => {
    await expect(finalizeInvoice(CONTRACT, { acceptPendingBonus: true })).resolves.toEqual({ ok: true });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      `http://localhost:3001/invoices/${CONTRACT}/finalize`,
      expect.objectContaining({ body: JSON.stringify({ acceptPendingBonus: true }) }),
    );
  });

  // OWASP Top 10:2025 A05 (Injection): only a real true accepts; anything else a caller passes is
  // sent as not accepted.
  it.each(["true", 1, null])("sends %j as not accepting the pending bonus", async (accept) => {
    await finalizeInvoice(CONTRACT, { acceptPendingBonus: accept as unknown as boolean });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ acceptPendingBonus: false }) }),
    );
  });

  // The lifecycle answers a refusal it can name with 422 as well as 409; the code must survive.
  it.each([
    ["INVOICE_DATA_INCOMPLETE", "Invoice belum bisa difinalisasi: masih ada komponen yang menunggu formula rate."],
    [
      "INVOICE_BONUS_PENDING",
      "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
    ],
  ])("reads a 422 %s refusal by its code", async (code, message) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(reply(422, { code, message: "server words" }));

    await expect(finalizeInvoice(CONTRACT)).resolves.toEqual({ ok: false, code, message });
  });

  it("refuses an id the API would never take, without asking it", async () => {
    vi.mocked(globalThis.fetch).mockClear();

    await expect(finalizeInvoice("DROP TABLE")).resolves.toMatchObject({
      ok: false,
      code: "INVOICE_NOT_FOUND",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses anyone but an admin, without asking (OWASP A01)", async () => {
    asRole(null);
    vi.mocked(globalThis.fetch).mockClear();

    await expect(finalizeInvoice(CONTRACT)).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["CONTRACT_NOT_ENDED", "Kontrak belum berakhir"],
    ["INVOICE_FINALIZED", "Invoice sudah difinalisasi"],
    ["INVOICE_DATA_INCOMPLETE", "Invoice belum bisa difinalisasi: masih ada komponen yang menunggu formula rate."],
    ["CONTRACT_NOT_FOUND", "Invoice tidak ditemukan."],
  ])("reads a %s refusal for the admin", async (code, message) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(reply(409, { code }));

    await expect(finalizeInvoice(CONTRACT)).resolves.toEqual({ ok: false, code, message });
  });

  it("names a refusal that sent no code by its status, in the words the server sent", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(reply(404, { message: "Kontrak tidak ditemukan" }));

    await expect(finalizeInvoice(CONTRACT)).resolves.toEqual({
      ok: false,
      code: "HTTP_404",
      message: "Kontrak tidak ditemukan",
    });
  });

  it("says only that it could not be done when a refusal sent neither code nor words", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(reply(400, {}));

    await expect(finalizeInvoice(CONTRACT)).resolves.toEqual({
      ok: false,
      code: "HTTP_400",
      message: "Permintaan tidak dapat diproses. Coba lagi.",
    });
  });

  it("reads a 422 that sent neither code nor message as a generic invalid request", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(reply(422, {}));

    await expect(finalizeInvoice(CONTRACT)).resolves.toEqual({
      ok: false,
      code: "INVALID",
      message: "Permintaan tidak dapat diproses. Coba lagi.",
    });
  });

  // A misconfigured deployment fails loudly here; the dialog that called catches and says so.
  it("throws when the backend address is not configured", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(finalizeInvoice(CONTRACT)).rejects.toThrow("BACKEND_URL is not configured");
  });

  it("says nothing of a server that failed, only that it could not answer", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      reply(503, { message: "upstream connect error" }),
    );

    await expect(finalizeInvoice(CONTRACT)).resolves.toMatchObject({
      ok: false,
      message: "Permintaan tidak dapat diproses. Coba lagi.",
    });
  });
});
