import { AMOUNT_INVALID, REASON_EMPTY } from "./invoice-adjustment";

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
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
    ["INVOICE_DATA_INCOMPLETE", "Invoice belum bisa difinalisasi: masih ada data yang menunggu, seperti bonus performa."],
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
      expect.objectContaining({ method: "POST" }),
    );
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
    ["INVOICE_DATA_INCOMPLETE", "Invoice belum bisa difinalisasi: masih ada data yang menunggu, seperti bonus performa."],
    ["CONTRACT_NOT_FOUND", "Invoice tidak ditemukan."],
  ])("reads a %s refusal for the admin", async (code, message) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(reply(409, { code }));

    await expect(finalizeInvoice(CONTRACT)).resolves.toEqual({ ok: false, code, message });
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
