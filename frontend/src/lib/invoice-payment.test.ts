import { INVOICE_STATUSES, type InvoiceStatus } from "./invoice";
import {
  canUploadProof,
  PROOF_MAX_BYTES,
  PROOF_TOO_LARGE,
  PROOF_TYPE_INVALID,
  PROOF_TYPES,
  validateProofFile,
  type ProofFile,
} from "./invoice-payment";

const MB = 1024 * 1024;

function file(over: Partial<ProofFile> = {}): ProofFile {
  return { name: "bukti-transfer.pdf", type: "application/pdf", size: 200 * 1024, ...over };
}

describe("canUploadProof", () => {
  it("offers the upload while the creator has acknowledged the invoice", () => {
    expect(canUploadProof("creator_acked")).toBe(true);
  });

  it.each(INVOICE_STATUSES.filter((status) => status !== "creator_acked"))(
    "withholds the upload while the invoice is %s",
    (status: InvoiceStatus) => {
      expect(canUploadProof(status)).toBe(false);
    },
  );
});

describe("PROOF_TYPES and PROOF_MAX_BYTES", () => {
  it("take PDF, JPG and PNG, as the PRD proposes", () => {
    expect(PROOF_TYPES).toEqual(["application/pdf", "image/jpeg", "image/png"]);
  });

  it("take a file up to 5 MB", () => {
    expect(PROOF_MAX_BYTES).toBe(5 * MB);
  });
});

describe("validateProofFile", () => {
  it.each([
    ["a PDF", file()],
    ["a JPG", file({ name: "bukti.jpg", type: "image/jpeg" })],
    ["a PNG", file({ name: "bukti.png", type: "image/png" })],
    ["a file of exactly 5 MB", file({ size: 5 * MB })],
  ])("takes %s", (_label, proof) => {
    expect(validateProofFile(proof)).toBeNull();
  });

  it.each([
    ["a Word document", file({ name: "bukti.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })],
    ["a GIF", file({ name: "bukti.gif", type: "image/gif" })],
    ["a file the browser could not type", file({ name: "bukti", type: "" })],
  ])("refuses %s with the type message", (_label, proof) => {
    expect(validateProofFile(proof)).toBe(PROOF_TYPE_INVALID);
  });

  it("refuses a file one byte over 5 MB with the size message", () => {
    expect(validateProofFile(file({ size: 5 * MB + 1 }))).toBe(PROOF_TOO_LARGE);
  });

  it("words each refusal for the admin in Indonesian", () => {
    expect(PROOF_TYPE_INVALID).toBe("File bukti pembayaran harus PDF, JPG, atau PNG.");
    expect(PROOF_TOO_LARGE).toBe("Ukuran file maksimal 5 MB.");
  });
});
