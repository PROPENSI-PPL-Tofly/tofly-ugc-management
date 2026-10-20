import { act, fireEvent, render, screen } from "@testing-library/react";
import { INVOICE_STATUSES } from "@/lib/invoice";
import { PROOF_TOO_LARGE, PROOF_TYPE_INVALID, UPLOAD_FAILED } from "@/lib/invoice-payment";
import type { UploadOutcome } from "@/lib/invoice-payment-actions.server";
import { PaymentProofUpload, type ProofUploader } from "./payment-proof-upload";

// The real upload is a server action; the control must never reach it in these tests.
vi.mock("@/lib/invoice-payment-actions.server", () => ({ uploadPaymentProof: vi.fn() }));

const CONTRACT = "11111111-1111-4111-8111-111111111111";
const MB = 1024 * 1024;

const PROOF_HREF = `/api/invoices/${CONTRACT}/payment-proof`;

const SAVED: UploadOutcome = {
  ok: true,
  proof: { fileName: "bukti.pdf", href: PROOF_HREF, uploadedAt: "2026-10-20T08:00:00.000Z" },
};

function pdf(size = 200 * 1024, name = "bukti.pdf", type = "application/pdf"): File {
  const file = new File(["%PDF-1.7"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function renderUpload(upload: ProofUploader, onUploaded = vi.fn()) {
  render(
    <PaymentProofUpload
      contractId={CONTRACT}
      status="creator_acked"
      upload={upload}
      onUploaded={onUploaded}
    />,
  );
  return onUploaded;
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("File bukti pembayaran"), { target: { files: [file] } });
}

const button = () => screen.getByRole("button", { name: "Upload bukti" });

describe("PaymentProofUpload", () => {
  it.each(INVOICE_STATUSES.filter((status) => status !== "creator_acked"))(
    "offers nothing while the invoice is %s",
    (status) => {
      const { container } = render(
        <PaymentProofUpload contractId={CONTRACT} status={status} upload={vi.fn()} onUploaded={vi.fn()} />,
      );

      expect(container).toBeEmptyDOMElement();
    },
  );

  it("offers a file picker for PDF, JPG and PNG once the creator has acknowledged", () => {
    renderUpload(vi.fn());

    expect(screen.getByLabelText("File bukti pembayaran")).toHaveAttribute(
      "accept",
      "application/pdf,image/jpeg,image/png",
    );
  });

  it("keeps the upload closed until a file is picked", () => {
    renderUpload(vi.fn());

    expect(button()).toBeDisabled();
  });

  it("goes back to waiting for a file when the admin cancels the picker", () => {
    renderUpload(vi.fn());

    pick(pdf());
    fireEvent.change(screen.getByLabelText("File bukti pembayaran"), { target: { files: [] } });

    expect(button()).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["a GIF", pdf(1000, "bukti.gif", "image/gif"), PROOF_TYPE_INVALID],
    ["a file over 5 MB", pdf(5 * MB + 1), PROOF_TOO_LARGE],
  ])("names what is wrong with %s at once and sends nothing", (_label, file, message) => {
    const upload = vi.fn();
    renderUpload(upload);

    pick(file);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(button()).toBeDisabled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("sends a file the rules take through the uploader it was given, as the form's file", async () => {
    const upload = vi.fn<ProofUploader>().mockResolvedValue(SAVED);
    renderUpload(upload);

    pick(pdf());
    await act(async () => fireEvent.click(button()));

    const [contractId, form] = upload.mock.calls[0];
    expect(contractId).toBe(CONTRACT);
    expect((form.get("file") as File).name).toBe("bukti.pdf");
  });

  it("says it is uploading and holds the button while the upload runs", async () => {
    let finish: (outcome: UploadOutcome) => void = () => {};
    const upload = vi.fn<ProofUploader>(() => new Promise((resolve) => (finish = resolve)));
    renderUpload(upload);

    pick(pdf());
    fireEvent.click(button());

    expect(await screen.findByRole("status")).toHaveTextContent("Mengunggah…");
    expect(button()).toBeDisabled();

    await act(async () => finish(SAVED));
  });

  it("shows the uploaded file by name, as a link, and tells the panel to read the invoice again", async () => {
    const onUploaded = renderUpload(vi.fn<ProofUploader>().mockResolvedValue(SAVED));

    pick(pdf());
    await act(async () => fireEvent.click(button()));

    expect(screen.getByRole("link", { name: "bukti.pdf" })).toHaveAttribute("href", PROOF_HREF);
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("shows the failure and lets the admin try again when the upload throws", async () => {
    const onUploaded = renderUpload(vi.fn<ProofUploader>().mockRejectedValue(new TypeError("fetch failed")));

    pick(pdf());
    await act(async () => fireEvent.click(button()));

    expect(screen.getByRole("alert")).toHaveTextContent(UPLOAD_FAILED);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(button()).toBeEnabled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("shows the server's message when the upload is refused, and lets the admin try again", async () => {
    const upload = vi
      .fn<ProofUploader>()
      .mockResolvedValue({ ok: false, message: "Invoice belum diakui creator." });
    const onUploaded = renderUpload(upload);

    pick(pdf());
    await act(async () => fireEvent.click(button()));

    expect(screen.getByRole("alert")).toHaveTextContent("Invoice belum diakui creator.");
    expect(button()).toBeEnabled();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
