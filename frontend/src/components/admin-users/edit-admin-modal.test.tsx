import { fireEvent, render, screen } from "@testing-library/react";
import { adminUser } from "./admin.fixture";
import { EditAdminModal } from "./edit-admin-modal";

function renderModal(overrides: Partial<Parameters<typeof EditAdminModal>[0]> = {}) {
  const props = {
    user: adminUser(),
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    saving: false,
    ...overrides,
  };
  render(<EditAdminModal {...props} />);
  return props;
}

describe("Ubah Admin", () => {
  it("starts from the admin's own name and role, without an email to change", () => {
    renderModal();

    expect(screen.getByLabelText(/Nama/)).toHaveValue("Rangga Pratama");
    expect(screen.getByLabelText(/Peran/)).toHaveValue("admin");
    expect(screen.queryByLabelText(/Email/)).toBeNull();
  });

  it("sends the name and the role it was left with", () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText(/Nama/), { target: { value: "Rangga P" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Rangga P", role: "admin" });
  });

  // AC 6 and AC 10: the caller's own row cannot be demoted or promoted, and the reason has to
  // be there on the control that is shut.
  it("shuts the role on the caller's own row and explains it on a tip", async () => {
    renderModal({ user: adminUser({ isSelf: true }) });

    expect(screen.getByLabelText(/Peran/)).toBeDisabled();
    const tip = screen.getByRole("button", { name: "Peran tidak bisa diubah" });
    fireEvent.click(tip);
    expect(await screen.findByText("Peran sendiri tidak bisa diubah")).toBeInTheDocument();
  });

  it("puts the last Super Admin refusal under the role field", () => {
    renderModal({
      serverErrors: { role: "Minimal harus ada satu Super Admin" },
    });

    expect(screen.getByText("Minimal harus ada satu Super Admin")).toBeInTheDocument();
  });

  it("will not send an empty name", () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText(/Nama/), { target: { value: "  " } });

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
