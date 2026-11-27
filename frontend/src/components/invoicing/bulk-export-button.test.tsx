import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BulkExportButton, downloadFilename } from "./bulk-export-button";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch }));

const IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

function response(
  body = "PK",
  disposition: string | null = "attachment; filename*=UTF-8''Rekap_Invoice_20260720.xlsx",
  ok = true,
  status = ok ? 201 : 500,
) {
  return {
    ok,
    status,
    json: vi.fn().mockImplementation(async () => JSON.parse(body)),
    blob: vi.fn().mockResolvedValue(new Blob([body])),
    headers: { get: (name: string) => (name === "content-disposition" ? disposition : null) },
  } as unknown as Response;
}

describe("downloadFilename", () => {
  it("reads an encoded name, a quoted name, and falls back when there is none", () => {
    expect(downloadFilename("attachment; filename*=UTF-8''Rekap_Invoice_20260720.xlsx")).toBe(
      "Rekap_Invoice_20260720.xlsx",
    );
    expect(downloadFilename('attachment; filename="Rekap_Invoice.xlsx"')).toBe(
      "Rekap_Invoice.xlsx",
    );
    expect(downloadFilename(null)).toBe("Rekap_Invoice.xlsx");
    expect(downloadFilename("attachment; filename*=UTF-8''%E0%A4%A")).toBe(
      "Rekap_Invoice.xlsx",
    );
    expect(downloadFilename("attachment")).toBe("Rekap_Invoice.xlsx");
  });
});

describe("BulkExportButton (31.5)", () => {
  let create: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    create = vi.fn().mockReturnValue("blob:rekap");
    revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true });
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("does nothing until an invoice is ticked", () => {
    const done = vi.fn();
    render(<BulkExportButton ids={[]} onDone={done} onFailure={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Unduh Terpilih" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("posts the ticked ids and saves the xlsx the server streamed", async () => {
    apiFetch.mockResolvedValue(response());
    const done = vi.fn();
    const { container } = render(
      <BulkExportButton ids={IDS} onDone={done} onFailure={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unduh Terpilih (2)" }));

    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith("/api/invoices/bulk-export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoiceIds: IDS }),
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(container.querySelector("a")).toBeNull();
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:rekap");
    expect(done).toHaveBeenCalledWith(
      "Rekap_Invoice_20260720.xlsx diunduh (2 invoice).",
    );
  });

  it("shows progress and stops further presses while preparing", async () => {
    let finish!: (value: Response) => void;
    apiFetch.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    render(<BulkExportButton ids={IDS} onDone={vi.fn()} onFailure={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh Terpilih (2)" }));
    const busy = screen.getByRole("button", { name: "Menyiapkan…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    fireEvent.click(busy);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    finish(response());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Unduh Terpilih (2)" })).toBeEnabled(),
    );
  });

  it("reports a failed export and lets the admin try again", async () => {
    apiFetch.mockRejectedValue(new Error("network"));
    const failed = vi.fn();
    render(<BulkExportButton ids={IDS} onDone={vi.fn()} onFailure={failed} />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh Terpilih (2)" }));

    await waitFor(() =>
      expect(failed).toHaveBeenCalledWith("Gagal membuat rekap. Coba lagi."),
    );
    expect(screen.getByRole("button", { name: "Unduh Terpilih (2)" })).toBeEnabled();
  });

  it("treats a non-OK response as a failure", async () => {
    apiFetch.mockResolvedValue(response("nope", null, false));
    const failed = vi.fn();
    render(<BulkExportButton ids={IDS} onDone={vi.fn()} onFailure={failed} />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh Terpilih (2)" }));

    await waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    expect(create).not.toHaveBeenCalled();
  });

  it("asks the server nothing when every ticked invoice would be skipped", async () => {
    const done = vi.fn();
    render(<BulkExportButton ids={IDS} exportable={0} onDone={done} onFailure={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh Terpilih (2)" }));

    await waitFor(() =>
      expect(done).toHaveBeenCalledWith("Tidak ada invoice yang bisa diunduh."),
    );
    expect(apiFetch).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("says so when the server finds nothing to export any more, and saves no file", async () => {
    apiFetch.mockResolvedValue(
      response(
        JSON.stringify({ code: "INVOICE_EXPORT_EMPTY", message: "Tidak ada invoice yang bisa diunduh." }),
        null,
        false,
        422,
      ),
    );
    const failed = vi.fn();
    render(<BulkExportButton ids={IDS} onDone={vi.fn()} onFailure={failed} />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh Terpilih (2)" }));

    await waitFor(() =>
      expect(failed).toHaveBeenCalledWith("Tidak ada invoice yang bisa diunduh."),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps the generic message for any other refusal, even one without a JSON body", async () => {
    apiFetch.mockResolvedValue(response("<html>", null, false, 422));
    const failed = vi.fn();
    render(<BulkExportButton ids={IDS} onDone={vi.fn()} onFailure={failed} />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh Terpilih (2)" }));

    await waitFor(() => expect(failed).toHaveBeenCalledWith("Gagal membuat rekap. Coba lagi."));
  });
});
