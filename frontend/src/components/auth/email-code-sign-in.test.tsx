import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  requestSignInCode,
  verifySignInCode,
  type CodeRequestOutcome,
  type CodeVerifyOutcome,
} from "@/lib/email-sign-in-api";
import { EmailCodeSignIn } from "./email-code-sign-in";

// The HTTP adapter is stubbed: these tests are about what each step shows and does. The adapter's
// own tests cover how each answer is read.
vi.mock("@/lib/email-sign-in-api", () => ({
  requestSignInCode: vi.fn(),
  verifySignInCode: vi.fn(),
}));

const EMAIL = "rangga@example.com";
const SENT: CodeRequestOutcome = { kind: "sent", resendAfterSeconds: 60 };

/** Lets the stubbed calls settle and React apply what they dispatched. */
async function settle() {
  await act(async () => {});
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function codeBoxes(): HTMLInputElement[] {
  return screen.getAllByRole("textbox", { name: /^Digit/ }) as HTMLInputElement[];
}

async function openEmailStep() {
  render(<EmailCodeSignIn />);
  fireEvent.click(screen.getByRole("button", { name: "Masuk dengan Kode Email" }));
}

async function sendCode(email = EMAIL) {
  await openEmailStep();
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));
  await settle();
}

async function enterAndCheck(code = "482913") {
  fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => code } });
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  await settle();
}

describe("EmailCodeSignIn", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.mocked(requestSignInCode).mockReset().mockResolvedValue(SENT);
    vi.mocked(verifySignInCode).mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    assign.mockReset();
  });

  describe("the entry (AC 1)", () => {
    it("offers signing in with an email code", () => {
      render(<EmailCodeSignIn />);

      expect(screen.getByRole("button", { name: "Masuk dengan Kode Email" })).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("opens the email step with the field focused", async () => {
      await openEmailStep();

      expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
      expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("type", "email");
      expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("autocomplete", "email");
    });
  });

  describe("the email step", () => {
    it.each([
      ["", "Email wajib diisi"],
      ["rangga.example.com", "Format email tidak valid"],
    ])("names a bad email %j under the field and sends nothing (AC 2)", async (email, problem) => {
      await openEmailStep();
      fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: email } });
      fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));

      const field = screen.getByRole("textbox", { name: "Email" });
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(problem);
      expect(requestSignInCode).not.toHaveBeenCalled();
    });

    it("sends the trimmed email and shows it is sending", async () => {
      const answer = deferred<CodeRequestOutcome>();
      vi.mocked(requestSignInCode).mockReturnValue(answer.promise);
      await openEmailStep();
      fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
        target: { value: ` ${EMAIL} ` },
      });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));

      expect(requestSignInCode).toHaveBeenCalledExactlyOnceWith(EMAIL);
      expect(screen.getByRole("button", { name: "Mengirim…" })).toBeDisabled();
      await act(async () => answer.resolve(SENT));
    });

    it.each([
      [{ kind: "limited", minutes: 12 } as const, "Terlalu banyak permintaan. Coba lagi dalam 12 menit."],
      [{ kind: "send_failed" } as const, "Kode gagal dikirim. Coba lagi."],
    ])("stays on the email step and announces %j (AC 5, 6)", async (outcome, text) => {
      vi.mocked(requestSignInCode).mockResolvedValue(outcome);

      await sendCode();

      expect(screen.getByRole("alert")).toHaveTextContent(text);
      expect(screen.getByRole("button", { name: "Kirim Kode" })).toBeEnabled();
    });

    it("shows the backend's field error under the email", async () => {
      vi.mocked(requestSignInCode).mockResolvedValue({
        kind: "invalid",
        message: "Format email tidak valid",
      });

      await sendCode();

      expect(screen.getByRole("textbox", { name: "Email" })).toHaveAccessibleDescription(
        "Format email tidak valid",
      );
    });
  });

  describe("the code step", () => {
    it("says a code was sent without saying whether the email is registered (AC 2)", async () => {
      await sendCode();

      expect(screen.getByRole("status")).toHaveTextContent(
        "Kalau email kamu terdaftar, kode sudah dikirim.",
      );
      expect(screen.getByText(EMAIL)).toBeInTheDocument();
      expect(codeBoxes()).toHaveLength(6);
      expect(codeBoxes()[0]).toHaveFocus();
    });

    it("lets the code be checked only once all six digits are in", async () => {
      await sendCode();

      expect(screen.getByRole("button", { name: "Masuk" })).toBeDisabled();
      fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => "48291" } });
      expect(screen.getByRole("button", { name: "Masuk" })).toBeDisabled();
      fireEvent.change(codeBoxes()[5], { target: { value: "3" } });
      expect(screen.getByRole("button", { name: "Masuk" })).toBeEnabled();
    });

    it("checks a pasted code and opens the role's home page (AC 7, 10)", async () => {
      const answer = deferred<CodeVerifyOutcome>();
      vi.mocked(verifySignInCode).mockReturnValue(answer.promise);
      await sendCode();

      fireEvent.paste(codeBoxes()[2], { clipboardData: { getData: () => "482913" } });
      fireEvent.click(screen.getByRole("button", { name: "Masuk" }));

      expect(verifySignInCode).toHaveBeenCalledExactlyOnceWith(EMAIL, "482913");
      expect(screen.getByRole("button", { name: "Memeriksa…" })).toBeDisabled();
      codeBoxes().forEach((box) => expect(box).toBeDisabled());

      await act(async () => answer.resolve({ kind: "signed_in", redirectTo: "/creator/dashboard" }));

      expect(assign).toHaveBeenCalledExactlyOnceWith("/creator/dashboard");
      expect(screen.getByRole("button", { name: "Memeriksa…" })).toBeDisabled();
    });

    it.each([
      [{ kind: "wrong", attemptsLeft: 4 } as const, "Kode salah. Sisa 4 percobaan.", "true"],
      [{ kind: "expired" } as const, "Kode sudah kedaluwarsa. Kirim ulang kode.", "true"],
      [{ kind: "denied" } as const, "Akses ditolak", "false"],
      [{ kind: "failed" } as const, "Gagal masuk. Coba lagi.", "false"],
    ])("empties the boxes and announces %j (AC 7, 8, 9, 11)", async (outcome, text, invalid) => {
      vi.mocked(verifySignInCode).mockResolvedValue(outcome);
      await sendCode();

      await enterAndCheck();

      expect(screen.getByRole("alert")).toHaveTextContent(text);
      codeBoxes().forEach((box) => {
        expect(box).toHaveValue("");
        expect(box).toHaveAttribute("aria-invalid", invalid);
        expect(box).toHaveAccessibleDescription(text);
      });
      expect(codeBoxes()[0]).toHaveFocus();
      expect(assign).not.toHaveBeenCalled();
    });

    it("goes back to the email step with the email kept, to change it", async () => {
      await sendCode();

      fireEvent.click(screen.getByRole("button", { name: "Ganti email" }));

      expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue(EMAIL);
    });
  });

  describe("resending (AC 4)", () => {
    it("locks Kirim Ulang for 60 seconds with a visible countdown, then sends a new code", async () => {
      vi.useFakeTimers();
      await sendCode();

      expect(screen.getByRole("button", { name: "Kirim Ulang (60 detik)" })).toBeDisabled();
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Kirim Ulang (59 detik)" })).toBeDisabled();
      act(() => vi.advanceTimersByTime(59_000));

      fireEvent.click(screen.getByRole("button", { name: "Kirim Ulang" }));
      await settle();

      expect(requestSignInCode).toHaveBeenCalledTimes(2);
      expect(requestSignInCode).toHaveBeenLastCalledWith(EMAIL);
      expect(screen.getByRole("button", { name: "Kirim Ulang (60 detik)" })).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Kalau email kamu terdaftar, kode sudah dikirim.",
      );
    });

    it("waits as long as the backend says", async () => {
      vi.mocked(requestSignInCode).mockResolvedValue({ kind: "sent", resendAfterSeconds: 90 });

      await sendCode();

      expect(screen.getByRole("button", { name: "Kirim Ulang (90 detik)" })).toBeDisabled();
    });

    it("clears an expired code's message and empties the boxes when a new code is sent", async () => {
      vi.useFakeTimers();
      vi.mocked(verifySignInCode).mockResolvedValue({ kind: "expired" });
      await sendCode();
      await enterAndCheck();
      act(() => vi.advanceTimersByTime(60_000));

      fireEvent.click(screen.getByRole("button", { name: "Kirim Ulang" }));
      await settle();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      codeBoxes().forEach((box) => expect(box).toHaveAttribute("aria-invalid", "false"));
    });

    it("announces the hourly limit on a resend and keeps the countdown unlocked (AC 5)", async () => {
      vi.useFakeTimers();
      await sendCode();
      act(() => vi.advanceTimersByTime(60_000));
      vi.mocked(requestSignInCode).mockResolvedValue({ kind: "limited", minutes: 42 });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Ulang" }));
      await settle();

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Terlalu banyak permintaan. Coba lagi dalam 42 menit.",
      );
      expect(screen.getByRole("button", { name: "Kirim Ulang" })).toBeEnabled();
    });
  });
});
