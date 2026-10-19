import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { COMMENT_FAILED, COMMENTS_UNAVAILABLE } from "@/lib/invoice-comments";
import type { CommentOutcome, CommentsOutcome } from "@/lib/invoice-comments-actions.server";
import type { InvoiceComment } from "@/lib/invoice-comments-api";
import { InvoiceComments, type CommentsGateway } from "./invoice-comments";

// The real thread is read and written by server actions; the component must never reach them here.
vi.mock("@/lib/invoice-comments-actions.server", () => ({
  loadInvoiceComments: vi.fn(),
  addInvoiceComment: vi.fn(),
}));

const CONTRACT = "11111111-1111-4111-8111-111111111111";

const FROM_CREATOR: InvoiceComment = {
  id: "c1",
  author: "Rangga Pratama",
  role: "creator",
  text: "Invoice sudah saya cek, aman.",
  createdAt: "2026-10-20T02:20:00.000Z",
};

const FROM_ADMIN: InvoiceComment = {
  id: "c2",
  author: "Admin Tofly",
  role: "admin",
  text: "Bukti transfer sudah diunggah ya.",
  createdAt: "2026-10-20T08:05:00.000Z",
};

const SAVED: InvoiceComment = {
  id: "c3",
  author: "Admin Tofly",
  role: "admin",
  text: "Pembayaran sudah dikirim.",
  createdAt: "2026-10-21T03:00:00.000Z",
};

function gateway(over: Partial<CommentsGateway> = {}): CommentsGateway {
  return {
    load: vi.fn().mockResolvedValue({ ok: true, comments: [FROM_CREATOR, FROM_ADMIN] }),
    add: vi.fn().mockResolvedValue({ ok: true, comment: SAVED }),
    ...over,
  };
}

async function renderThread(comments: CommentsGateway = gateway()) {
  await act(async () => {
    render(<InvoiceComments contractId={CONTRACT} comments={comments} />);
  });
  return comments;
}

function type(text: string) {
  fireEvent.change(screen.getByLabelText("Tulis komentar"), { target: { value: text } });
}

async function send() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kirim" })));
}

const items = () => within(screen.getByRole("list", { name: "Komentar" })).getAllByRole("listitem");

describe("InvoiceComments", () => {
  it("says it is loading while the thread is read", () => {
    const comments = gateway({ load: vi.fn(() => new Promise<CommentsOutcome>(() => {})) });
    render(<InvoiceComments contractId={CONTRACT} comments={comments} />);

    expect(screen.getByRole("status")).toHaveTextContent("Memuat komentar…");
    expect(comments.load).toHaveBeenCalledWith(CONTRACT);
  });

  it("lists every comment in the order it was given, with who wrote it, as which role, and when", async () => {
    await renderThread();

    const [first, second] = items();
    expect(first).toHaveTextContent("Rangga Pratama");
    expect(first).toHaveTextContent("Creator");
    expect(first).toHaveTextContent("20 Okt 2026, 09.20 WIB");
    expect(first).toHaveTextContent("Invoice sudah saya cek, aman.");
    expect(second).toHaveTextContent("Admin Tofly");
    expect(second).toHaveTextContent("Admin");
    expect(second).toHaveTextContent("Bukti transfer sudah diunggah ya.");
  });

  it("says there are no comments yet for an empty thread", async () => {
    await renderThread(gateway({ load: vi.fn().mockResolvedValue({ ok: true, comments: [] }) }));

    expect(screen.getByText("Belum ada komentar.")).toBeInTheDocument();
  });

  it("shows the message when the thread cannot be read", async () => {
    await renderThread(
      gateway({ load: vi.fn().mockResolvedValue({ ok: false, message: "Komentar tidak bisa dimuat." }) }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Komentar tidak bisa dimuat.");
  });

  it("sends what the admin typed, adds the saved comment at the end and clears the box", async () => {
    const comments = await renderThread();

    type("Pembayaran sudah dikirim.");
    await send();

    expect(comments.add).toHaveBeenCalledWith(CONTRACT, "Pembayaran sudah dikirim.");
    expect(items()).toHaveLength(3);
    expect(items()[2]).toHaveTextContent("Pembayaran sudah dikirim.");
    expect(screen.getByLabelText("Tulis komentar")).toHaveValue("");
  });

  it("shows the message and keeps what was typed when the comment is not saved", async () => {
    await renderThread(
      gateway({ add: vi.fn().mockResolvedValue({ ok: false, message: "Komentar maksimal 500 karakter." }) }),
    );

    type("Komentar yang terlalu panjang");
    await send();

    expect(screen.getByRole("alert")).toHaveTextContent("Komentar maksimal 500 karakter.");
    expect(screen.getByLabelText("Tulis komentar")).toHaveValue("Komentar yang terlalu panjang");
    expect(items()).toHaveLength(2);
  });

  it("shows the thread as unavailable when reading it throws, instead of loading for ever", async () => {
    await renderThread(gateway({ load: vi.fn().mockRejectedValue(new TypeError("fetch failed")) }));

    expect(screen.getByRole("alert")).toHaveTextContent(COMMENTS_UNAVAILABLE);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the failure, frees the button and keeps the text when sending throws", async () => {
    await renderThread(gateway({ add: vi.fn().mockRejectedValue(new TypeError("fetch failed")) }));

    type("Halo");
    await send();

    expect(screen.getByRole("alert")).toHaveTextContent(COMMENT_FAILED);
    expect(screen.getByRole("button", { name: "Kirim" })).toBeEnabled();
    expect(screen.getByLabelText("Tulis komentar")).toHaveValue("Halo");
  });

  it("stops the box at 500 characters and counts what is typed, as the prototype's box does", async () => {
    await renderThread();

    expect(screen.getByLabelText("Tulis komentar")).toHaveAttribute("maxLength", "500");
    expect(screen.getByText("0/500")).toBeInTheDocument();

    type("Halo");

    expect(screen.getByText("4/500")).toBeInTheDocument();
  });

  it.each(["", "   "])("keeps Kirim off while the box holds nothing to say (%j)", async (text) => {
    const comments = await renderThread();

    type(text);

    expect(screen.getByRole("button", { name: "Kirim" })).toBeDisabled();
    expect(comments.add).not.toHaveBeenCalled();
  });

  it("turns Kirim on once there is something to say", async () => {
    await renderThread();

    type("Halo");

    expect(screen.getByRole("button", { name: "Kirim" })).toBeEnabled();
  });

  it("holds the button while a comment is being sent", async () => {
    let finish: (value: CommentOutcome) => void = () => {};
    await renderThread(
      gateway({ add: vi.fn(() => new Promise<CommentOutcome>((resolve) => (finish = resolve))) }),
    );

    type("Halo");
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));

    expect(screen.getByRole("button", { name: "Kirim" })).toBeDisabled();
    await act(async () => finish({ ok: true, comment: SAVED }));
  });
});
