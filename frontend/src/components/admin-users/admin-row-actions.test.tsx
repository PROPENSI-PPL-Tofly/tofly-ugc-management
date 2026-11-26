import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { deactivateAdmin, reactivateAdmin, updateAdmin } from "@/lib/admin-users-api";
import { adminUser } from "./admin.fixture";
import { AdminRowActions } from "./admin-row-actions";

vi.mock("@/lib/admin-users-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-users-api")>();
  return {
    ...actual,
    updateAdmin: vi.fn(),
    deactivateAdmin: vi.fn(),
    reactivateAdmin: vi.fn(),
  };
});

function renderActions(
  user = adminUser({ id: "u1" }),
  withConfirmation = (_action: string, run: () => void) => run(),
  onChanged = vi.fn(),
) {
  render(
    <AdminRowActions
      user={user}
      withConfirmation={withConfirmation}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

describe("the Pengguna Admin row actions", () => {
  beforeEach(() => {
    vi.mocked(updateAdmin).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(deactivateAdmin).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(reactivateAdmin).mockReset().mockResolvedValue({ ok: true });
  });

  it("shuts deactivation on the caller's own row and says why", async () => {
    renderActions(adminUser({ id: "u1", isSelf: true }));

    expect(screen.getByRole("button", { name: "Ubah" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nonaktifkan" })).toBeDisabled();
    const tip = screen.getByRole("button", {
      name: "Super Admin tidak bisa menonaktifkan dirinya sendiri",
    });
    fireEvent.click(tip);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Super Admin tidak bisa menonaktifkan dirinya sendiri",
    );
    expect(deactivateAdmin).not.toHaveBeenCalled();
  });

  it("confirms a deactivation, then sends the id the code confirmed", async () => {
    const withConfirmation = vi.fn((_action: string, run: () => void) => run());
    const { onChanged } = renderActions(adminUser({ id: "u1" }), withConfirmation);

    fireEvent.click(screen.getByRole("button", { name: "Nonaktifkan" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));

    await waitFor(() => expect(deactivateAdmin).toHaveBeenCalledWith("u1"));
    expect(withConfirmation).toHaveBeenCalledWith("deactivate", expect.any(Function));
    expect(onChanged).toHaveBeenCalledWith("Admin dinonaktifkan.");
  });

  // The backend asks for the email code before a Super Admin comes back (23.2), so the page asks
  // for it first instead of failing the press.
  it("asks for the code before reactivating a Super Admin", async () => {
    const withConfirmation = vi.fn((_action: string, run: () => void) => run());
    const { onChanged } = renderActions(
      adminUser({ id: "u1", isActive: false, role: "super_admin" }),
      withConfirmation,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aktifkan" }));

    await waitFor(() => expect(reactivateAdmin).toHaveBeenCalledWith("u1"));
    expect(withConfirmation).toHaveBeenCalledWith("reactivate_super_admin", expect.any(Function));
    expect(onChanged).toHaveBeenCalledWith("Admin diaktifkan kembali.");
  });

  it("reactivates an inactive admin without a code or a dialog", async () => {
    const withConfirmation = vi.fn();
    const { onChanged } = renderActions(
      adminUser({ id: "u1", isActive: false, role: "admin" }),
      withConfirmation,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aktifkan" }));

    await waitFor(() => expect(reactivateAdmin).toHaveBeenCalledWith("u1"));
    expect(withConfirmation).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith("Admin diaktifkan kembali.");
  });

  it("asks for the code before sending a changed role", async () => {
    const withConfirmation = vi.fn((_action: string, run: () => void) => run());
    renderActions(adminUser({ id: "u1" }), withConfirmation);

    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    fireEvent.change(await screen.findByLabelText(/Peran/), {
      target: { value: "super_admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(updateAdmin).toHaveBeenCalledWith(
        "u1",
        { name: "Rangga Pratama", role: "super_admin" },
      ),
    );
    expect(withConfirmation).toHaveBeenCalledWith("role_change", expect.any(Function));
  });

  it("does not ask for a code when only the name changed", async () => {
    const withConfirmation = vi.fn();
    renderActions(adminUser({ id: "u1" }), withConfirmation);

    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    fireEvent.change(await screen.findByLabelText(/Nama/), { target: { value: "Rangga P" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(updateAdmin).toHaveBeenCalledWith("u1", { name: "Rangga P" }),
    );
    expect(withConfirmation).not.toHaveBeenCalled();
  });

  it("keeps the edit open with the field the backend refused", async () => {
    vi.mocked(updateAdmin).mockResolvedValue({
      ok: false,
      message: "Minimal harus ada satu Super Admin",
      errors: { role: "Minimal harus ada satu Super Admin" },
    });
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    fireEvent.change(await screen.findByLabelText(/Peran/), {
      target: { value: "super_admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Minimal harus ada satu Super Admin")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says why a deactivation was refused", async () => {
    vi.mocked(deactivateAdmin).mockResolvedValue({
      ok: false,
      message: "Admin gagal diubah. Coba lagi.",
      errors: {},
    });
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Nonaktifkan" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Admin gagal diubah. Coba lagi.");
  });
});
