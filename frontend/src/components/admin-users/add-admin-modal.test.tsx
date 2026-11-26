import { fireEvent, render, screen } from "@testing-library/react";
import { AddAdminModal } from "./add-admin-modal";

function renderModal(overrides: Partial<Parameters<typeof AddAdminModal>[0]> = {}) {
  const props = {
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    saving: false,
    ...overrides,
  };
  render(<AddAdminModal {...props} />);
  return props;
}

function fill() {
  fireEvent.change(screen.getByLabelText(/Nama/), { target: { value: "Rangga" } });
  fireEvent.change(screen.getByLabelText(/Email/), {
    target: { value: "rangga@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Peran/), { target: { value: "super_admin" } });
}

describe("Tambah Admin", () => {
  it("asks for a name, an email and one of the two roles", () => {
    renderModal();

    expect(screen.getByLabelText(/Nama/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Peran/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Super Admin" })).toBeInTheDocument();
  });

  it("holds Simpan until the form is filled, then sends it once", () => {
    const { onSubmit } = renderModal();

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Rangga",
      email: "rangga@example.com",
      role: "super_admin",
    });
  });

  it("names the field on its own line once it was left blank", () => {
    renderModal();

    fireEvent.blur(screen.getByLabelText(/Nama/));

    expect(screen.getByText("Nama wajib diisi")).toBeInTheDocument();
  });

  it("shows a taken email under Email, not as a line about the whole form", () => {
    renderModal({ serverErrors: { email: "Email sudah dipakai" } });

    expect(screen.getByText("Email sudah dipakai")).toBeInTheDocument();
  });

  it("cannot send twice while the first save is still running", () => {
    renderModal({ saving: true });
    fill();

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
});

describe("Tambah Admin's way out", () => {
  it("closes on Escape without sending anything", () => {
    const { onClose, onSubmit } = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
