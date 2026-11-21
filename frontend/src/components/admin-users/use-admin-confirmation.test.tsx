import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { requestConfirmation, verifyConfirmation } from "@/lib/admin-users-api";
import { useAdminConfirmation } from "./use-admin-confirmation";

vi.mock("@/lib/admin-users-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-users-api")>();
  return { ...actual, requestConfirmation: vi.fn(), verifyConfirmation: vi.fn() };
});

/** A page's one row action, with the hook standing between it and the backend. */
function Harness({ run }: { run: (confirmationId: string) => void }) {
  const { withConfirmation, prompt } = useAdminConfirmation();

  return (
    <>
      <button onClick={() => withConfirmation("role_change", run)}>Ubah peran</button>
      {prompt}
    </>
  );
}

function codeIsSent(expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()) {
  vi.mocked(requestConfirmation).mockResolvedValue({
    kind: "sent",
    confirmationId: "c1",
    message: "Kode dikirim ke email kamu.",
  });
  vi.mocked(verifyConfirmation).mockResolvedValue({ kind: "confirmed", expiresAt });
}

async function typeCode(code: string) {
  // The boxes arrive after the code has been sent; the first render only says it is sending.
  const first = await screen.findByLabelText("Digit 1 dari 6");
  fireEvent.change(first, { target: { value: code } });
}

async function confirm() {
  const button = await screen.findByRole("button", { name: "Konfirmasi" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("the confirmation before a sensitive action", () => {
  beforeEach(() => {
    vi.mocked(requestConfirmation).mockReset();
    vi.mocked(verifyConfirmation).mockReset();
    codeIsSent();
  });

  it("sends a code and runs nothing until it is accepted", async () => {
    const run = vi.fn();
    render(<Harness run={run} />);

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(requestConfirmation).toHaveBeenCalledWith("role_change");
    expect(run).not.toHaveBeenCalled();

    await typeCode("123456");
    await confirm();

    await waitFor(() => expect(run).toHaveBeenCalledWith("c1"));
    expect(verifyConfirmation).toHaveBeenCalledWith("c1", "123456");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // AC 11: one confirmation covers the role change and the deactivation for 15 minutes.
  it("lets the next action through on the same confirmation without another code", async () => {
    const run = vi.fn();
    render(<Harness run={run} />);

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));
    await screen.findByRole("dialog");
    await typeCode("123456");
    await confirm();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));

    expect(run).toHaveBeenCalledTimes(2);
    expect(requestConfirmation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for a new code once the one it holds has run out", async () => {
    codeIsSent(new Date(Date.now() - 1000).toISOString());
    const run = vi.fn();
    render(<Harness run={run} />);

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));
    await screen.findByRole("dialog");
    await typeCode("123456");
    await confirm();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(requestConfirmation).toHaveBeenCalledTimes(2);
  });

  it("runs nothing when the Super Admin cancels the prompt", async () => {
    const run = vi.fn();
    render(<Harness run={run} />);

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps a wrong code on screen with the tries the backend left", async () => {
    vi.mocked(verifyConfirmation).mockResolvedValue({ kind: "wrong", attemptsLeft: 2 });
    const run = vi.fn();
    render(<Harness run={run} />);

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));
    await screen.findByRole("dialog");
    await typeCode("000000");
    await confirm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Kode salah. Sisa 2 percobaan.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it("says an expired code must be sent again", async () => {
    vi.mocked(verifyConfirmation).mockResolvedValue({ kind: "expired" });
    render(<Harness run={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ubah peran" }));
    await screen.findByRole("dialog");
    await typeCode("123456");
    await confirm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Kode sudah kedaluwarsa. Kirim ulang kode.",
    );
    expect(screen.getByRole("button", { name: "Kirim ulang kode" })).toBeInTheDocument();
  });
});
