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

import {
  acknowledgeInvoice,
  addInvoiceComment,
  confirmInvoicePayment,
} from "./creator-invoice-actions.server";
import { currentRole } from "./session.server";

const CONTRACT = "5a5a5a5a-0000-4000-8000-000000000003";
const GENERIC = "Permintaan tidak dapat diproses. Coba lagi.";

const asRole = (role: "admin" | "creator" | null) => vi.mocked(currentRole).mockResolvedValue(role);

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function fetchSpy() {
  return vi.mocked(globalThis.fetch);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BACKEND_URL", "http://localhost:3001");
  sessionCookies.push({ name: "__session", value: "abc" });
  incoming.current = {};
  asRole("creator");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(201, {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionCookies.length = 0;
});

// The three moves share every guard; each is checked once per move below.
const MOVES = [
  ["acknowledgeInvoice", (id: string) => acknowledgeInvoice(id), "acknowledge", {}],
  ["confirmInvoicePayment", (id: string) => confirmInvoicePayment(id), "confirm-payment", {}],
  ["addInvoiceComment", (id: string) => addInvoiceComment(id, "  Sudah saya cek.  "), "comments", { text: "Sudah saya cek." }],
] as const;

describe.each(MOVES)("%s", (_, move, path, body) => {
  it("posts to the creator's own invoice with the session, and nothing naming the creator", async () => {
    await expect(move(CONTRACT)).resolves.toEqual({ ok: true });

    expect(fetchSpy()).toHaveBeenCalledWith(
      `http://localhost:3001/me/invoices/${CONTRACT}/${path}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
        headers: expect.objectContaining({ cookie: "__session=abc" }),
      }),
    );
  });

  it("forwards the Origin the browser sent, so the backend's same-origin check accepts the move", async () => {
    incoming.current = { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" };

    await move(CONTRACT);

    expect(fetchSpy()).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }),
      }),
    );
  });

  it.each([
    ["not a UUID", "../creators"],
    ["a path climbing out of the invoice", "5a5a5a5a-0000-4000-8000-000000000003/../../invoices"],
    ["not a string", 42 as unknown as string],
  ])("refuses an id that is %s before asking anyone", async (__, id) => {
    await expect(move(id)).resolves.toEqual({
      ok: false,
      code: "INVOICE_NOT_FOUND",
      message: "Invoice tidak ditemukan.",
    });
    expect(fetchSpy()).not.toHaveBeenCalled();
  });

  it("asks a caller with no session to sign in again, sending nothing", async () => {
    asRole(null);

    await expect(move(CONTRACT)).resolves.toEqual({
      ok: false,
      code: "UNAUTHENTICATED",
      message: "Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.",
    });
    expect(fetchSpy()).not.toHaveBeenCalled();
  });

  it("refuses an admin, since these moves are the creator's own", async () => {
    asRole("admin");

    await expect(move(CONTRACT)).resolves.toEqual({ ok: false, code: "FORBIDDEN", message: "Akses ditolak" });
    expect(fetchSpy()).not.toHaveBeenCalled();
  });

  it("answers generically when the session cannot be read, rather than throwing at the browser", async () => {
    vi.mocked(currentRole).mockRejectedValue(new Error("Reading the session failed with HTTP 500"));

    await expect(move(CONTRACT)).resolves.toEqual({ ok: false, code: "UNAVAILABLE", message: GENERIC });
  });

  it.each([
    [401, {}, "UNAUTHENTICATED", "Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan."],
    [403, { code: "FORBIDDEN", message: "Invoice milik creator lain" }, "FORBIDDEN", "Akses ditolak"],
    [404, {}, "INVOICE_NOT_FOUND", "Invoice tidak ditemukan."],
    [
      409,
      { code: "INVALID_INVOICE_TRANSITION", message: "Invoice is not finalized" },
      "INVALID_INVOICE_TRANSITION",
      "Status invoice sudah berubah. Muat ulang halaman untuk melihat status terbaru.",
    ],
    [422, { code: "SOMETHING_NEW", message: "Komentar maksimal 500 karakter" }, "SOMETHING_NEW", "Komentar maksimal 500 karakter"],
    [400, { code: "SOMETHING_NEW" }, "SOMETHING_NEW", GENERIC],
  ] as const)("reads a %i refusal in the creator's words", async (status, answer, code, message) => {
    fetchSpy().mockResolvedValue(reply(status, answer));

    await expect(move(CONTRACT)).resolves.toEqual({ ok: false, code, message });
  });

  it("hides what a server error said, so nothing of the backend reaches the browser", async () => {
    fetchSpy().mockResolvedValue(reply(500, { message: "PrismaClientKnownRequestError at invoices.update" }));

    await expect(move(CONTRACT)).resolves.toEqual({ ok: false, code: "HTTP_500", message: GENERIC });
  });

  it("answers generically when a refusal carries no JSON", async () => {
    fetchSpy().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 409 }));

    await expect(move(CONTRACT)).resolves.toEqual({ ok: false, code: "HTTP_409", message: GENERIC });
  });

  it("answers generically when the backend cannot be reached", async () => {
    fetchSpy().mockRejectedValue(new TypeError("fetch failed"));

    await expect(move(CONTRACT)).resolves.toEqual({ ok: false, code: "UNAVAILABLE", message: GENERIC });
  });
});

describe("addInvoiceComment's own checks", () => {
  it.each([
    ["empty", "", "Komentar wajib diisi"],
    ["only spaces", "    ", "Komentar wajib diisi"],
    ["501 characters", "a".repeat(501), "Komentar maksimal 500 karakter"],
    ["not a string", 7 as unknown as string, "Komentar wajib diisi"],
  ])("refuses a comment that is %s before anything is sent", async (_, text, message) => {
    await expect(addInvoiceComment(CONTRACT, text)).resolves.toEqual({ ok: false, code: "COMMENT_INVALID", message });
    expect(fetchSpy()).not.toHaveBeenCalled();
  });

  it("sends a comment of exactly 500 characters", async () => {
    await expect(addInvoiceComment(CONTRACT, "a".repeat(500))).resolves.toEqual({ ok: true });
  });
});

describe("a refusal that names no code", () => {
  it("keeps its HTTP status as the code and the message the backend wrote for people", async () => {
    fetchSpy().mockResolvedValue(reply(400, { message: "Invoice sudah di-acknowledge" }));

    await expect(acknowledgeInvoice(CONTRACT)).resolves.toEqual({
      ok: false,
      code: "HTTP_400",
      message: "Invoice sudah di-acknowledge",
    });
  });
});
