import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAdmin, requestConfirmation, verifyConfirmation } from "@/lib/admin-users-api";
import { AddAdminTrigger } from "./add-admin-trigger";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/admin-users-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-users-api")>();
  return {
    ...actual,
    createAdmin: vi.fn(),
    requestConfirmation: vi.fn(),
    verifyConfirmation: vi.fn(),
  };
});

function addAs(role: "admin" | "super_admin") {
  render(<AddAdminTrigger />);
  fireEvent.click(screen.getByRole("button", { name: "Tambah Admin" }));
  fireEvent.change(screen.getByLabelText(/Nama/), { target: { value: "Rangga" } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "rangga@example.com" } });
  fireEvent.change(screen.getByLabelText(/Peran/), { target: { value: role } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
}

describe("Tambah Admin's save", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(createAdmin).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(requestConfirmation)
      .mockReset()
      .mockResolvedValue({ kind: "sent", message: "Kode dikirim ke email kamu.", validMinutes: 10 });
    vi.mocked(verifyConfirmation)
      .mockReset()
      .mockResolvedValue({ kind: "confirmed", expiresAt: new Date(Date.now() + 900_000).toISOString() });
  });

  it("adds an Admin straight away", async () => {
    addAs("admin");

    await waitFor(() =>
      expect(createAdmin).toHaveBeenCalledWith({
        name: "Rangga",
        email: "rangga@example.com",
        role: "admin",
      }),
    );
    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // The backend asks for the email code before anyone is made Super Admin (23.2), so the page
  // asks for it first and adds them only once the code is right.
  it("asks for the email code before adding a Super Admin", async () => {
    addAs("super_admin");

    expect(await screen.findByRole("heading", { name: "Konfirmasi lewat email" })).toBeInTheDocument();
    expect(createAdmin).not.toHaveBeenCalled();

    await waitFor(() => expect(requestConfirmation).toHaveBeenCalledTimes(1));
    fireEvent.change(await screen.findByLabelText("Digit 1 dari 6"), {
      target: { value: "123456" },
    });
    const confirm = screen.getByRole("button", { name: "Konfirmasi" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(createAdmin).toHaveBeenCalledWith({
        name: "Rangga",
        email: "rangga@example.com",
        role: "super_admin",
      }),
    );
    expect(verifyConfirmation).toHaveBeenCalledWith("123456");
  });
});
