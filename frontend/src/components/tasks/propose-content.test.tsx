import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { submitProposal } from "@/lib/creator-proposal-api";
import { ProposeContent } from "./propose-content";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/creator-proposal-api", () => ({ submitProposal: vi.fn() }));

const submit = vi.mocked(submitProposal);

const WINDOW = { first: "2026-11-21", last: "2026-12-26" };

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  submit.mockReset();
});

function open() {
  render(<ProposeContent window={WINDOW} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Ajukan Konten" }));
  return screen.getByRole("dialog", { name: "Ajukan Konten" });
}

function fill(dialog: HTMLElement, values: { name?: string; brief?: string; deadline?: string; notes?: string }) {
  const set = (label: string, value: string | undefined) => {
    if (value !== undefined) fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  };
  set("Nama Konten", values.name);
  set("Brief", values.brief);
  set("Usulan Deadline", values.deadline);
  set("Catatan untuk Admin", values.notes);
}

const VALID = { name: "Review Sunscreen Gel", brief: "Pakai gel di pantai.", deadline: "2026-12-01" };

// PBI-14 (14.2) AC 1: "Ajukan Konten" in Task Saya opens the prototype's form.
describe("ProposeContent, the form", () => {
  it("opens the form from + Ajukan Konten, as a Specific content", () => {
    const dialog = open();

    expect(screen.getByTestId("modal-eyebrow")).toHaveTextContent("Konten Specific");
    expect(within(dialog).getByLabelText("Nama Konten")).toHaveAttribute("maxlength", "100");
    expect(within(dialog).getByLabelText("Brief")).toHaveAttribute("maxlength", "1000");
    expect(within(dialog).getByLabelText("Usulan Deadline")).toHaveAttribute("type", "date");
    expect(within(dialog).getByLabelText("Catatan untuk Admin")).toHaveAttribute("maxlength", "500");
  });

  it("uses the prototype's placeholders", () => {
    const dialog = open();

    expect(within(dialog).getByLabelText("Nama Konten")).toHaveAttribute(
      "placeholder",
      "mis. Review Sunscreen Gel di Pantai",
    );
    expect(within(dialog).getByLabelText("Brief")).toHaveAttribute(
      "placeholder",
      "Ide konten, produk yang dipakai, gaya video…",
    );
    expect(within(dialog).getByLabelText("Catatan untuk Admin")).toHaveAttribute("placeholder", "Opsional");
  });

  it("counts the characters of each text field against its limit", () => {
    const dialog = open();
    fill(dialog, { name: "Review", brief: "Brief", notes: "Catatan" });

    expect(dialog).toHaveTextContent("6/100");
    expect(dialog).toHaveTextContent("5/1000");
    expect(dialog).toHaveTextContent("7/500");
  });

  // AC 2: the picker disables every other day, and the tooltip names the window.
  it("limits the date picker to the window and names it in the tooltip", () => {
    const dialog = open();

    const deadline = within(dialog).getByLabelText("Usulan Deadline");
    expect(deadline).toHaveAttribute("min", "2026-11-21");
    expect(deadline).toHaveAttribute("max", "2026-12-26");
    expect(within(dialog).getByRole("tooltip")).toHaveTextContent(
      "Pilih antara 21 Nov 2026 dan 26 Des 2026. Kalau Admin belum memutuskan sampai H-1, pengajuan otomatis masuk jadwal.",
    );
  });
});

describe("ProposeContent, errors per field", () => {
  it("names each required field left empty, and asks nothing yet", () => {
    const dialog = open();

    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    expect(dialog).toHaveTextContent("Nama konten wajib diisi");
    expect(dialog).toHaveTextContent("Brief wajib diisi");
    expect(dialog).toHaveTextContent("Pilih deadline");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Nama Konten")).toHaveAttribute("aria-invalid", "true");
  });

  it("names the window for a deadline outside it", () => {
    const dialog = open();
    fill(dialog, { ...VALID, deadline: "2026-12-27" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    expect(dialog).toHaveTextContent("Pilih antara 21 Nov 2026 dan 26 Des 2026");
  });

  it("clears a field's message once it is changed", () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    fill(dialog, { name: "Review" });

    expect(dialog).not.toHaveTextContent("Nama konten wajib diisi");
    expect(dialog).toHaveTextContent("Brief wajib diisi");
  });
});

// AC 4: sending asks for confirmation and shows a toast.
describe("ProposeContent, sending", () => {
  it("asks before sending, naming the content and its deadline", () => {
    const dialog = open();
    fill(dialog, VALID);

    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    const confirm = screen.getByRole("alertdialog", { name: "Kirim Pengajuan?" });
    expect(confirm).toHaveTextContent("Review Sunscreen Gel");
    expect(confirm).toHaveTextContent("1 Des 2026");
    expect(within(confirm).getByRole("button", { name: "Kirim" })).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it("goes back to the form with everything kept on Periksa Lagi", () => {
    const dialog = open();
    fill(dialog, VALID);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    fireEvent.click(screen.getByRole("button", { name: "Periksa Lagi" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Nama Konten")).toHaveValue("Review Sunscreen Gel");
    expect(submit).not.toHaveBeenCalled();
  });

  it("sends, closes the form, toasts and shows Menunggu Admin", async () => {
    submit.mockResolvedValue({ ok: true });
    const dialog = open();
    fill(dialog, { ...VALID, notes: "Tolong kirim produk" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    });

    expect(submit).toHaveBeenCalledExactlyOnceWith({ ...VALID, notes: "Tolong kirim produk" });
    expect(screen.queryByRole("dialog", { name: "Ajukan Konten" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Pengajuan terkirim. Tunggu persetujuan Admin.");
    expect(push).toHaveBeenCalledWith("/creator/tasks?tab=waiting");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows Mengirim… and holds the form while it sends", async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    submit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const dialog = open();
    fill(dialog, VALID);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));

    expect(within(dialog).getByRole("button", { name: "Mengirim…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Batal" })).toBeDisabled();
    await act(async () => finish({ ok: true }));
  });

  it("stays open when ✕ is pressed while it sends", async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    submit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const dialog = open();
    fill(dialog, VALID);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Tutup dialog" }));

    expect(screen.getByRole("dialog", { name: "Ajukan Konten" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => finish({ ok: true }));
  });

  it("keeps the form open with the API's message under its field", async () => {
    submit.mockResolvedValue({ ok: false, message: "", errors: { deadline: "Deadline sudah lewat" } });
    const dialog = open();
    fill(dialog, VALID);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    });

    expect(dialog).toHaveTextContent("Deadline sudah lewat");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the form open with a failure at its top", async () => {
    submit.mockResolvedValue({ ok: false, message: "Pengajuan gagal dikirim. Coba lagi.", errors: {} });
    const dialog = open();
    fill(dialog, VALID);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim Pengajuan" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    });

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Pengajuan gagal dikirim. Coba lagi.");
    expect(within(dialog).getByLabelText("Nama Konten")).toHaveValue("Review Sunscreen Gel");
  });
});

describe("ProposeContent, closing", () => {
  it("closes an empty form at once", () => {
    const dialog = open();

    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog", { name: "Ajukan Konten" })).not.toBeInTheDocument();
  });

  it("asks before throwing away what was typed", () => {
    const dialog = open();
    fill(dialog, { brief: "Ide" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));

    expect(screen.getByRole("alertdialog", { name: "Batalkan pengajuan konten?" })).toBeInTheDocument();
  });

  it("opens empty again after it was closed", () => {
    const dialog = open();
    fill(dialog, { name: "Review" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Buang" }));

    fireEvent.click(screen.getByRole("button", { name: "+ Ajukan Konten" }));

    expect(within(screen.getByRole("dialog", { name: "Ajukan Konten" })).getByLabelText("Nama Konten")).toHaveValue("");
  });
});
