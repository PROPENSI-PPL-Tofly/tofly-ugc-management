import { act, fireEvent, render, screen } from "@testing-library/react";
import type { BufferSaver } from "@/lib/deadline-buffer";
import { DeadlineBufferModal } from "./deadline-buffer-modal";

function renderModal(overrides: Partial<Parameters<typeof DeadlineBufferModal>[0]> = {}) {
  const props = {
    current: 5,
    onClose: vi.fn<() => void>(),
    onSaved: vi.fn<(bufferDays: number) => void>(),
    saveAction: vi.fn<BufferSaver>().mockResolvedValue({ ok: true, bufferDays: 7 }),
    ...overrides,
  };
  render(<DeadlineBufferModal {...props} />);
  return props;
}

const field = () => screen.getByLabelText("Buffer deadline (hari)");
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

async function confirmChange() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ya, Ubah" }));
  });
}

describe("DeadlineBufferModal", () => {
  it("opens on the buffer in force, explaining both deadline lines it sets", () => {
    renderModal({ current: 6 });

    expect(screen.getByRole("dialog", { name: "Atur Buffer Deadline" })).toBeInTheDocument();
    expect(field()).toHaveValue("6");
    expect(screen.getByText(/paling cepat 6 hari setelah hari ini/i)).toBeInTheDocument();
    // QA: the note said "semua jadwal", although content already scheduled keeps its deadline.
    expect(screen.getByText(/^Berlaku untuk jadwal baru:/)).toBeInTheDocument();
    expect(screen.queryByText(/semua jadwal/i)).not.toBeInTheDocument();
    expect(screen.getByText(/paling lambat 6 hari sebelum akhir kontrak/i)).toBeInTheDocument();
  });

  it("offers no save while the buffer has not changed", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it.each([
    ["", "Isi buffer deadline"],
    ["0", "Isi angka bulat 1–14"],
    ["15", "Isi angka bulat 1–14"],
    // QA: a minus or a decimal point was dropped without a word, so -3 saved as 3 and 1.5 as 15.
    ["-3", "Isi angka bulat 1–14"],
    ["1.5", "Isi angka bulat 1–14"],
  ])("refuses %j at the field without asking to confirm", (typed, message) => {
    const { saveAction } = renderModal();

    type(typed);
    save();

    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription(message);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("keeps what was typed, so a value it cannot take is refused rather than changed", () => {
    renderModal();

    type("-3");

    expect(field()).toHaveValue("-3");
  });

  it("asks to confirm the old and new buffer before saving", () => {
    const { saveAction } = renderModal();

    type("7");
    save();

    const dialog = screen.getByRole("alertdialog", { name: "Ubah buffer deadline?" });
    expect(dialog).toHaveTextContent("5 hari → 7 hari");
    expect(dialog).toHaveTextContent("Berlaku untuk jadwal baru. Jadwal yang sudah ada tidak berubah.");
    expect(dialog).toHaveTextContent(/Ajukan Konten/);
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("goes back to the form when the confirmation is cancelled", () => {
    const { saveAction } = renderModal();

    type("7");
    save();
    fireEvent.click(screen.getByRole("button", { name: "Kembali" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(field()).toHaveValue("7");
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("saves the confirmed buffer and hands back what the API stored", async () => {
    const { saveAction, onSaved } = renderModal();

    type("7");
    save();
    await confirmChange();

    expect(saveAction).toHaveBeenCalledWith(7);
    expect(onSaved).toHaveBeenCalledWith(7);
  });

  it("shows the API's field message beside the field", async () => {
    const { onSaved } = renderModal({
      saveAction: vi.fn<BufferSaver>().mockResolvedValue({
        ok: false,
        status: 422,
        message: "Data buffer deadline tidak valid",
        fieldError: "Isi angka bulat 1–14",
      }),
    });

    type("7");
    save();
    await confirmChange();

    expect(field()).toHaveAccessibleDescription("Isi angka bulat 1–14");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows any other refusal for the whole form", async () => {
    renderModal({
      saveAction: vi.fn<BufferSaver>().mockResolvedValue({
        ok: false,
        status: 403,
        message: "Hanya Super Admin yang bisa mengubah buffer deadline.",
      }),
    });

    type("7");
    save();
    await confirmChange();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Hanya Super Admin yang bisa mengubah buffer deadline.",
    );
  });

  it("closes straight away while nothing was typed", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("asks before discarding a typed buffer", () => {
    const { onClose } = renderModal();

    type("9");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
