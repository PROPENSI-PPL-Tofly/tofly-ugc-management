vi.mock("./backend.server", () => ({ backendPostForm: vi.fn() }));
vi.mock("./session.server", () => ({ currentRole: vi.fn() }));

import { backendPostForm } from "./backend.server";
import {
  PROOF_TOO_LARGE,
  PROOF_TYPE_INVALID,
  UPLOAD_FAILED,
  UPLOAD_FORBIDDEN,
} from "./invoice-payment";
import { uploadPaymentProof } from "./invoice-payment-actions.server";
import { currentRole } from "./session.server";

const CONTRACT = "11111111-1111-4111-8111-111111111111";
const MB = 1024 * 1024;

// What 13.2 answers for a saved proof.
const SAVED = {
  fileName: "bukti.pdf",
  url: `/api/invoices/${CONTRACT}/payment-proof`,
  uploadedAt: "2026-10-20T08:00:00.000Z",
};

function proofForm(file: File | string | null = new File(["%PDF-1.7"], "bukti.pdf", { type: "application/pdf" })) {
  const form = new FormData();
  if (file !== null) form.set("file", file);
  return form;
}

function sized(bytes: number, type = "application/pdf", name = "bukti.pdf"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

function reply(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

describe("uploadPaymentProof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentRole).mockResolvedValue("admin");
    vi.mocked(backendPostForm).mockResolvedValue(reply(201, SAVED));
  });

  it("sends the file to the invoice's payment proof and answers with the saved proof", async () => {
    await expect(uploadPaymentProof(CONTRACT, proofForm())).resolves.toEqual({
      ok: true,
      proof: { fileName: "bukti.pdf", href: SAVED.url, uploadedAt: SAVED.uploadedAt },
    });

    const [path, sent] = vi.mocked(backendPostForm).mock.calls[0];
    expect(path).toBe(`/invoices/${CONTRACT}/payment-proof`);
    expect((sent.get("file") as File).name).toBe("bukti.pdf");
  });

  it("sends the file and nothing else the form carried", async () => {
    const form = proofForm();
    form.set("status", "paid");

    await uploadPaymentProof(CONTRACT, form);

    const [, sent] = vi.mocked(backendPostForm).mock.calls[0];
    expect([...sent.keys()]).toEqual(["file"]);
  });

  it.each(["../creators", "not-an-id", ""])(
    "refuses the contract id %j before anything reaches the backend",
    async (contractId) => {
      await expect(uploadPaymentProof(contractId, proofForm())).resolves.toEqual({
        ok: false,
        message: "Invoice tidak ditemukan.",
      });
      expect(backendPostForm).not.toHaveBeenCalled();
    },
  );

  it.each(["creator", null] as const)("refuses a %s, sending nothing", async (role) => {
    vi.mocked(currentRole).mockResolvedValue(role);

    await expect(uploadPaymentProof(CONTRACT, proofForm())).resolves.toEqual({
      ok: false,
      message: UPLOAD_FORBIDDEN,
    });
    expect(UPLOAD_FORBIDDEN).toBe("Hanya admin yang dapat mengunggah bukti pembayaran.");
    expect(backendPostForm).not.toHaveBeenCalled();
  });

  it.each([
    ["a GIF", proofForm(sized(1000, "image/gif", "bukti.gif")), PROOF_TYPE_INVALID],
    ["a file over 5 MB", proofForm(sized(5 * MB + 1)), PROOF_TOO_LARGE],
    ["no file at all", proofForm(null), PROOF_TYPE_INVALID],
    ["text in place of a file", proofForm("bukti.pdf"), PROOF_TYPE_INVALID],
  ])("checks %s again on the server, sending nothing", async (_label, form, message) => {
    await expect(uploadPaymentProof(CONTRACT, form)).resolves.toEqual({ ok: false, message });
    expect(backendPostForm).not.toHaveBeenCalled();
  });

  it("refuses a program renamed to .pdf by its first bytes, sending nothing", async () => {
    const renamed = new File([Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])], "bukti.pdf", {
      type: "application/pdf",
    });

    await expect(uploadPaymentProof(CONTRACT, proofForm(renamed))).resolves.toEqual({
      ok: false,
      message: PROOF_TYPE_INVALID,
    });
    expect(backendPostForm).not.toHaveBeenCalled();
  });

  it("passes on the backend's own message when it refuses the upload", async () => {
    vi.mocked(backendPostForm).mockResolvedValue(
      reply(409, { code: "INVOICE_NOT_ACKNOWLEDGED", message: "Invoice belum diakui creator." }),
    );

    await expect(uploadPaymentProof(CONTRACT, proofForm())).resolves.toEqual({
      ok: false,
      message: "Invoice belum diakui creator.",
    });
  });

  it.each([
    ["a server error", () => vi.mocked(backendPostForm).mockResolvedValue(reply(500, { message: "Prisma P2002 at invoices" }))],
    ["a refusal without a message", () => vi.mocked(backendPostForm).mockResolvedValue(reply(400, {}))],
    ["an answer that is not JSON", () => vi.mocked(backendPostForm).mockResolvedValue(reply(201, "<html>"))],
    ["a saved answer without the proof", () => vi.mocked(backendPostForm).mockResolvedValue(reply(201, {}))],
    ["the network failing", () => vi.mocked(backendPostForm).mockRejectedValue(new TypeError("fetch failed"))],
  ])("answers %s with the general failure, never the raw error", async (_label, arrange) => {
    arrange();

    await expect(uploadPaymentProof(CONTRACT, proofForm())).resolves.toEqual({
      ok: false,
      message: UPLOAD_FAILED,
    });
    expect(UPLOAD_FAILED).toBe("Bukti pembayaran gagal diunggah. Coba lagi.");
  });
});
