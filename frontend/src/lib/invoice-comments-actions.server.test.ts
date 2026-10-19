vi.mock("./backend.server", () => ({ backendGet: vi.fn(), backendPost: vi.fn() }));
vi.mock("./session.server", () => ({ currentRole: vi.fn() }));

import { backendGet, backendPost } from "./backend.server";
import {
  COMMENT_FAILED,
  COMMENT_FORBIDDEN,
  COMMENTS_FORBIDDEN,
  COMMENTS_UNAVAILABLE,
} from "./invoice-comments";
import { addInvoiceComment, loadInvoiceComments } from "./invoice-comments-actions.server";
import { currentRole } from "./session.server";

const CONTRACT = "11111111-1111-4111-8111-111111111111";

// A thread as 13.2 answers it, oldest first.
const THREAD = [
  {
    id: "c1",
    authorName: "Rangga Pratama",
    role: "creator",
    text: "Invoice sudah saya cek, aman.",
    createdAt: "2026-10-20T02:20:00.000Z",
  },
  {
    id: "c2",
    authorName: "Admin Tofly",
    role: "admin",
    text: "Bukti transfer sudah diunggah ya.",
    createdAt: "2026-10-20T08:05:00.000Z",
  },
];

function reply(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

describe("loadInvoiceComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentRole).mockResolvedValue("admin");
    vi.mocked(backendGet).mockResolvedValue(reply(200, THREAD));
  });

  it("reads the invoice's thread and answers it under the page's names, in the API's order", async () => {
    const outcome = await loadInvoiceComments(CONTRACT);

    expect(backendGet).toHaveBeenCalledWith(`/invoices/${CONTRACT}/comments`);
    expect(outcome).toEqual({
      ok: true,
      comments: [
        {
          id: "c1",
          author: "Rangga Pratama",
          role: "creator",
          text: "Invoice sudah saya cek, aman.",
          createdAt: "2026-10-20T02:20:00.000Z",
        },
        {
          id: "c2",
          author: "Admin Tofly",
          role: "admin",
          text: "Bukti transfer sudah diunggah ya.",
          createdAt: "2026-10-20T08:05:00.000Z",
        },
      ],
    });
  });

  it("answers an invoice nobody has commented on with an empty thread", async () => {
    vi.mocked(backendGet).mockResolvedValue(reply(200, []));

    await expect(loadInvoiceComments(CONTRACT)).resolves.toEqual({ ok: true, comments: [] });
  });

  it.each(["../creators", "not-an-id", ""])(
    "refuses the contract id %j before anything reaches the backend",
    async (contractId) => {
      await expect(loadInvoiceComments(contractId)).resolves.toEqual({
        ok: false,
        message: COMMENTS_UNAVAILABLE,
      });
      expect(backendGet).not.toHaveBeenCalled();
    },
  );

  it.each(["creator", null] as const)("refuses a %s, reading nothing", async (role) => {
    vi.mocked(currentRole).mockResolvedValue(role);

    await expect(loadInvoiceComments(CONTRACT)).resolves.toEqual({
      ok: false,
      message: COMMENTS_FORBIDDEN,
    });
    expect(COMMENTS_FORBIDDEN).toBe("Hanya admin yang dapat membuka komentar invoice ini.");
    expect(backendGet).not.toHaveBeenCalled();
  });

  it.each([
    ["a server error", () => vi.mocked(backendGet).mockResolvedValue(reply(500, { message: "Prisma P2025" }))],
    ["a refusal", () => vi.mocked(backendGet).mockResolvedValue(reply(404, { message: "Invoice tidak ditemukan." }))],
    ["an answer that is not JSON", () => vi.mocked(backendGet).mockResolvedValue(reply(200, "<html>"))],
    ["an answer that is not a list", () => vi.mocked(backendGet).mockResolvedValue(reply(200, { items: [] }))],
    ["the network failing", () => vi.mocked(backendGet).mockRejectedValue(new TypeError("fetch failed"))],
  ])("answers %s with the thread unavailable, never the raw error", async (_label, arrange) => {
    arrange();

    await expect(loadInvoiceComments(CONTRACT)).resolves.toEqual({
      ok: false,
      message: COMMENTS_UNAVAILABLE,
    });
    expect(COMMENTS_UNAVAILABLE).toBe("Komentar tidak bisa dimuat.");
  });
});

describe("addInvoiceComment", () => {
  const SAVED = {
    id: "c3",
    authorName: "Admin Tofly",
    role: "admin",
    text: "Pembayaran sudah dikirim ya.",
    createdAt: "2026-10-21T03:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentRole).mockResolvedValue("admin");
    vi.mocked(backendPost).mockResolvedValue(reply(201, SAVED));
  });

  it("sends the text to the invoice's thread and answers the saved comment under the page's names", async () => {
    await expect(addInvoiceComment(CONTRACT, "Pembayaran sudah dikirim ya.")).resolves.toEqual({
      ok: true,
      comment: {
        id: "c3",
        author: "Admin Tofly",
        role: "admin",
        text: "Pembayaran sudah dikirim ya.",
        createdAt: "2026-10-21T03:00:00.000Z",
      },
    });
    expect(backendPost).toHaveBeenCalledWith(`/invoices/${CONTRACT}/comments`, {
      text: "Pembayaran sudah dikirim ya.",
    });
  });

  it.each(["../creators", "not-an-id", ""])(
    "refuses the contract id %j before anything reaches the backend",
    async (contractId) => {
      await expect(addInvoiceComment(contractId, "Halo")).resolves.toEqual({
        ok: false,
        message: COMMENT_FAILED,
      });
      expect(backendPost).not.toHaveBeenCalled();
    },
  );

  it.each(["creator", null] as const)("refuses a %s, sending nothing", async (role) => {
    vi.mocked(currentRole).mockResolvedValue(role);

    await expect(addInvoiceComment(CONTRACT, "Halo")).resolves.toEqual({
      ok: false,
      message: COMMENT_FORBIDDEN,
    });
    expect(COMMENT_FORBIDDEN).toBe("Hanya admin yang dapat menambah komentar di sini.");
    expect(backendPost).not.toHaveBeenCalled();
  });

  it.each([
    ["a number", 42],
    ["an object", { text: "Halo" }],
    ["nothing", undefined],
  ])("refuses %s in place of the text, sending nothing", async (_label, text) => {
    await expect(addInvoiceComment(CONTRACT, text as unknown as string)).resolves.toEqual({
      ok: false,
      message: COMMENT_FAILED,
    });
    expect(backendPost).not.toHaveBeenCalled();
  });

  it("passes on the backend's own message when it refuses the comment", async () => {
    vi.mocked(backendPost).mockResolvedValue(
      reply(422, { message: "Komentar maksimal 500 karakter." }),
    );

    await expect(addInvoiceComment(CONTRACT, "x".repeat(501))).resolves.toEqual({
      ok: false,
      message: "Komentar maksimal 500 karakter.",
    });
  });

  it.each([
    ["a server error", () => vi.mocked(backendPost).mockResolvedValue(reply(500, { message: "Prisma P2003" }))],
    ["a refusal without a message", () => vi.mocked(backendPost).mockResolvedValue(reply(400, {}))],
    ["an answer that is not JSON", () => vi.mocked(backendPost).mockResolvedValue(reply(201, "<html>"))],
    ["a saved answer without the comment", () => vi.mocked(backendPost).mockResolvedValue(reply(201, {}))],
    ["the network failing", () => vi.mocked(backendPost).mockRejectedValue(new TypeError("fetch failed"))],
  ])("answers %s with the general failure, never the raw error", async (_label, arrange) => {
    arrange();

    await expect(addInvoiceComment(CONTRACT, "Halo")).resolves.toEqual({
      ok: false,
      message: COMMENT_FAILED,
    });
    expect(COMMENT_FAILED).toBe("Komentar gagal dikirim. Coba lagi.");
  });
});
