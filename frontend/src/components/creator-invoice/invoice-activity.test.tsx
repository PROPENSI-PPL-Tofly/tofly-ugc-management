import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NONE_REACHED, aCreatorInvoice } from "@/lib/creator-invoice.builder";
import type { CreatorInvoice } from "@/lib/creator-invoice";
import { addInvoiceComment } from "@/lib/creator-invoice-actions.server";
import { InvoiceActivity } from "./invoice-activity";

vi.mock("@/lib/creator-invoice-actions.server", () => ({ addInvoiceComment: vi.fn() }));

const ADMIN_COMMENT = {
  id: "c-1",
  authorName: "Budi",
  authorRole: "admin" as const,
  text: "Bukti transfer sudah aku upload, mohon dicek ya.",
  createdAt: "2026-12-04T03:00:00Z",
};

const SAVED = {
  id: "c-9",
  authorName: "Rangga Pratama",
  authorRole: "creator" as const,
  text: "Sudah saya cek.",
  createdAt: "2026-12-05T03:00:00Z",
};

function renderActivity(overrides: Partial<CreatorInvoice> = {}) {
  const onCommented = vi.fn();
  const invoice = aCreatorInvoice(overrides);
  render(<InvoiceActivity invoice={invoice} onCommented={onCommented} />);
  return { onCommented, invoice };
}

function field() {
  return screen.getByRole("textbox", { name: "Komentar" });
}

describe("InvoiceActivity", () => {
  beforeEach(() => {
    vi.mocked(addInvoiceComment).mockReset().mockResolvedValue({ ok: true, comment: SAVED });
  });

  it("lists the steps and the comments, oldest first, each dated", () => {
    renderActivity({
      status: "payment_uploaded",
      reachedAt: { ...NONE_REACHED, finalized: "2026-12-01T02:00:00Z", payment_uploaded: "2026-12-04T02:00:00Z" },
      comments: [ADMIN_COMMENT],
    });

    const items = within(screen.getByRole("list", { name: "Aktivitas & komentar" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Invoice difinalisasi Admin");
    expect(items[0]).toHaveTextContent("1 Des 2026");
    expect(items[1]).toHaveTextContent("Admin mengirim bukti bayar");
    expect(items[2]).toHaveTextContent("Admin");
    expect(items[2]).toHaveTextContent("Bukti transfer sudah aku upload, mohon dicek ya.");
    expect(items[2]).toHaveTextContent("4 Des 2026, 10.00 WIB");
  });

  it("says there is nothing yet when nothing happened", () => {
    renderActivity();

    expect(screen.getByText("Belum ada aktivitas atau komentar.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows a comment as text, never as markup", () => {
    renderActivity({ comments: [{ ...ADMIN_COMMENT, text: "<img src=x onerror=alert(1)>" }] });

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  describe("the comment form", () => {
    it("holds Kirim Komentar until there is something to send", () => {
      renderActivity();
      const send = screen.getByRole("button", { name: "Kirim Komentar" });

      expect(send).toBeDisabled();
      fireEvent.change(field(), { target: { value: "   " } });
      expect(send).toBeDisabled();
      fireEvent.change(field(), { target: { value: "Sudah saya cek." } });
      expect(send).toBeEnabled();
    });

    it("stops typing at 500 characters and counts them", () => {
      renderActivity();

      expect(field()).toHaveAttribute("maxLength", "500");
      fireEvent.change(field(), { target: { value: "a".repeat(500) } });
      expect(screen.getByText("Maksimal 500 karakter")).toBeInTheDocument();
      expect(screen.getByText(/500\/500/)).toBeInTheDocument();
    });

    it("sends the comment, empties the field and hands on the comment the server saved", async () => {
      const { onCommented, invoice } = renderActivity();
      fireEvent.change(field(), { target: { value: "Sudah saya cek." } });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Komentar" }));

      await waitFor(() => expect(onCommented).toHaveBeenCalledWith(SAVED));
      expect(addInvoiceComment).toHaveBeenCalledWith(invoice.contractId, "Sudah saya cek.");
      expect(field()).toHaveValue("");
    });

    it("holds the button while the comment is on its way", async () => {
      let answer: (value: { ok: true; comment: null }) => void = () => {};
      vi.mocked(addInvoiceComment).mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderActivity();
      fireEvent.change(field(), { target: { value: "Halo" } });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Komentar" }));

      expect(screen.getByRole("button", { name: "Kirim Komentar" })).toBeDisabled();
      answer({ ok: true, comment: null });
      await waitFor(() => expect(field()).toHaveValue(""));
    });

    it("locks the field while the comment is on its way, so nothing typed meanwhile is wiped on success", async () => {
      let answer: (value: { ok: true; comment: null }) => void = () => {};
      vi.mocked(addInvoiceComment).mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderActivity();
      fireEvent.change(field(), { target: { value: "Halo" } });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Komentar" }));

      expect(field()).toBeDisabled();
      answer({ ok: true, comment: null });
      await waitFor(() => expect(field()).toBeEnabled());
      expect(field()).toHaveValue("");
    });

    it("keeps what was typed and says why when the comment is refused", async () => {
      vi.mocked(addInvoiceComment).mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Akses ditolak" });
      const { onCommented } = renderActivity();
      fireEvent.change(field(), { target: { value: "Halo" } });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Komentar" }));

      expect(await screen.findByText("Akses ditolak")).toBeInTheDocument();
      expect(field()).toHaveValue("Halo");
      expect(onCommented).not.toHaveBeenCalled();
    });

    it("says try again when sending fails outright", async () => {
      vi.mocked(addInvoiceComment).mockRejectedValue(new Error("network"));
      renderActivity();
      fireEvent.change(field(), { target: { value: "Halo" } });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Komentar" }));

      expect(await screen.findByText("Permintaan tidak dapat diproses. Coba lagi.")).toBeInTheDocument();
    });
  });
});
