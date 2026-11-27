import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { requestConfirmation, verifyConfirmation } from "@/lib/admin-users-api";
import { AdminCodePrompt } from "./admin-code-prompt";

vi.mock("@/lib/admin-users-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-users-api")>();
  return { ...actual, requestConfirmation: vi.fn(), verifyConfirmation: vi.fn() };
});

function boxes(): HTMLInputElement[] {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

function code(): string {
  return boxes()
    .map((box) => box.value)
    .join("");
}

function renderPrompt() {
  const onConfirmed = vi.fn();
  render(<AdminCodePrompt action="role_change" onConfirmed={onConfirmed} onCancel={vi.fn()} />);
  return { onConfirmed };
}

async function checkCode(digits: string) {
  fireEvent.change(boxes()[0], { target: { value: digits } });
  const button = screen.getByRole("button", { name: "Konfirmasi" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("the email-code prompt before a sensitive change", () => {
  beforeEach(() => {
    vi.mocked(requestConfirmation)
      .mockReset()
      .mockResolvedValue({ kind: "sent", message: "Kode dikirim ke email kamu." });
    vi.mocked(verifyConfirmation).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts the cursor in the first box as soon as the code is sent", async () => {
    renderPrompt();

    const first = await screen.findByLabelText("Digit 1 dari 6");
    await waitFor(() => expect(first).toHaveFocus());
  });

  // QA: after a wrong code the old digits stayed and the cursor was gone, so a code typed again
  // went over the old one.
  it("empties the boxes and puts the cursor back in the first after a wrong code", async () => {
    vi.mocked(verifyConfirmation).mockResolvedValue({ kind: "wrong", attemptsLeft: 4 });
    renderPrompt();
    await screen.findByLabelText("Digit 1 dari 6");

    await checkCode("000000");

    expect(await screen.findByRole("alert")).toHaveTextContent("Kode salah. Sisa 4 percobaan.");
    expect(code()).toBe("");
    await waitFor(() => expect(boxes()[0]).toHaveFocus());
  });

  it("empties the boxes when a new code is sent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPrompt();
    await screen.findByLabelText("Digit 1 dari 6");
    fireEvent.change(boxes()[0], { target: { value: "123" } });

    await waitFor(() => expect(code()).toBe("123"));
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    const resend = screen.getByRole("button", { name: "Kirim ulang kode" });
    await waitFor(() => expect(resend).toBeEnabled());
    fireEvent.click(resend);

    await waitFor(() => expect(requestConfirmation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(code()).toBe(""));
  });

  it("hands over the time the right code confirms the session until", async () => {
    vi.mocked(verifyConfirmation).mockResolvedValue({
      kind: "confirmed",
      expiresAt: "2026-11-27T12:00:00.000Z",
    });
    const { onConfirmed } = renderPrompt();
    await screen.findByLabelText("Digit 1 dari 6");

    await checkCode("123456");

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith("2026-11-27T12:00:00.000Z"));
  });
});
