import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssignSlotModal } from "./assign-slot-modal";

const assignManualSlot = vi.fn();

vi.mock("@/lib/contents", () => ({
  assignManualSlot: (...args: unknown[]) => assignManualSlot(...args),
}));

function renderModal(overrides: { deadline?: string } = {}) {
  const onClose = vi.fn();
  const onAssigned = vi.fn();
  render(
    <AssignSlotModal
      deadline={overrides.deadline ?? "2026-10-13"}
      onClose={onClose}
      onAssigned={onAssigned}
    />,
  );
  return { onClose, onAssigned };
}

describe("AssignSlotModal", () => {
  beforeEach(() => {
    assignManualSlot.mockReset();
  });

  it("renders form with deadline display", () => {
    renderModal({ deadline: "2026-10-13" });

    expect(screen.getByRole("dialog", { name: /Tambah Konten/i })).toBeInTheDocument();
    expect(screen.getByText("2026-10-13")).toBeInTheDocument();
  });

  it("renders content name input", () => {
    renderModal();

    expect(screen.getByLabelText(/Nama Konten/i)).toBeInTheDocument();
  });

  it("disables save when name is empty", () => {
    renderModal();

    expect(screen.getByRole("button", { name: /Simpan/i })).toBeDisabled();
  });

  it("enables save when name is filled", async () => {
    renderModal();

    await userEvent.type(screen.getByLabelText(/Nama Konten/i), "Test Content");

    expect(screen.getByRole("button", { name: /Simpan/i })).toBeEnabled();
  });

  it("calls assignManualSlot on submit", async () => {
    assignManualSlot.mockResolvedValue({ id: "content-1" });
    const { onAssigned } = renderModal();

    await userEvent.type(screen.getByLabelText(/Nama Konten/i), "Test Content");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    expect(assignManualSlot).toHaveBeenCalledWith({
      contentId: expect.any(String),
      deadline: "2026-10-13",
    });
    expect(onAssigned).toHaveBeenCalled();
  });

  it("shows error on failure", async () => {
    assignManualSlot.mockRejectedValueOnce(new Error("Gagal menyimpan"));
    renderModal();

    await userEvent.type(screen.getByLabelText(/Nama Konten/i), "Test Content");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal menyimpan");
  });

  it("closes on Batal", async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
