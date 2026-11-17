import { act, fireEvent, render, screen } from "@testing-library/react";
import { requestCode, verifyCode } from "@/lib/email-sign-in-api";
import { EmailCodeSignIn } from "./email-code-sign-in";

vi.mock("@/lib/email-sign-in-api", () => ({ requestCode: vi.fn(), verifyCode: vi.fn() }));

const EMAIL = "rangga@example.com";
const SENT = { kind: "sent", message: "Kalau email kamu terdaftar, kode sudah dikirim." } as const;

/** Lets pending promises settle inside act, so the screen shows what they led to. */
async function settle() {
  await act(async () => {});
}

/** A promise the test resolves when it wants, to look at the screen while a call is pending. */
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function emailField() {
  return screen.getByLabelText("Email");
}

function boxes(): HTMLInputElement[] {
  return screen.getAllByRole("textbox", { name: /^Digit/ }) as HTMLInputElement[];
}

function openEmailStep() {
  fireEvent.click(screen.getByRole("button", { name: "Masuk dengan Kode Email" }));
}

async function reachCodeStep(email = EMAIL) {
  vi.mocked(requestCode).mockResolvedValueOnce(SENT);
  openEmailStep();
  fireEvent.change(emailField(), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));
  await settle();
}

function typeCode(code: string) {
  fireEvent.paste(boxes()[0], { clipboardData: { getData: () => code } });
}

function submitCode() {
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
}

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(requestCode).mockReset();
  vi.mocked(verifyCode).mockReset();
  assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("EmailCodeSignIn: choosing email", () => {
  it("offers signing in with an email code, and shows no form until it is chosen", () => {
    render(<EmailCodeSignIn />);

    expect(screen.getByRole("button", { name: "Masuk dengan Kode Email" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("asks for the email once chosen, focused, with the browser's email autofill", () => {
    render(<EmailCodeSignIn />);

    openEmailStep();

    expect(emailField()).toHaveFocus();
    expect(emailField()).toHaveAttribute("type", "email");
    expect(emailField()).toHaveAttribute("autocomplete", "email");
    expect(screen.getByRole("button", { name: "Kirim Kode" })).toBeInTheDocument();
  });

  it("goes back to the choice on Batal", () => {
    render(<EmailCodeSignIn />);
    openEmailStep();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.getByRole("button", { name: "Masuk dengan Kode Email" })).toBeInTheDocument();
  });
});

describe("EmailCodeSignIn: requesting a code", () => {
  it.each([
    ["an empty email", "   ", "Email wajib diisi"],
    ["a malformed email", "rangga@example", "Format email tidak valid"],
    ["an email over 254 characters", `${"a".repeat(250)}@example.com`, "Email maksimal 254 karakter"],
  ])("refuses %s under the field without asking the backend", (_, typed, message) => {
    render(<EmailCodeSignIn />);
    openEmailStep();

    fireEvent.change(emailField(), { target: { value: typed } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));

    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveAccessibleDescription(message);
    expect(requestCode).not.toHaveBeenCalled();
  });

  it("asks for a code for the trimmed, lower-cased email", async () => {
    render(<EmailCodeSignIn />);

    await reachCodeStep("  Rangga@Example.COM ");

    expect(requestCode).toHaveBeenCalledExactlyOnceWith(EMAIL);
  });

  it("shows that the code is on its way and locks the form while asking", async () => {
    const call = pending<typeof SENT>();
    vi.mocked(requestCode).mockReturnValueOnce(call.promise);
    render(<EmailCodeSignIn />);
    openEmailStep();
    fireEvent.change(emailField(), { target: { value: EMAIL } });

    fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));

    expect(screen.getByRole("button", { name: "Mengirim…" })).toBeDisabled();
    expect(emailField()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();
    call.resolve(SENT);
    await settle();
  });

  it("asks only once when the form is sent twice while the first ask is pending", async () => {
    const call = pending<typeof SENT>();
    vi.mocked(requestCode).mockReturnValueOnce(call.promise);
    render(<EmailCodeSignIn />);
    openEmailStep();
    fireEvent.change(emailField(), { target: { value: EMAIL } });
    const form = emailField().closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(requestCode).toHaveBeenCalledTimes(1);
    call.resolve(SENT);
    await settle();
  });

  it("moves to the code step with the one answer every address gets", async () => {
    render(<EmailCodeSignIn />);

    await reachCodeStep();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kalau email kamu terdaftar, kode sudah dikirim.",
    );
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(boxes()).toHaveLength(6);
    expect(boxes()[0]).toHaveFocus();
  });

  it.each([
    ["limited", "Terlalu banyak permintaan. Coba lagi dalam 42 menit."],
    ["not_sent", "Kode gagal dikirim. Coba lagi."],
  ] as const)("stays on the email step and announces a %s answer", async (kind, message) => {
    vi.mocked(requestCode).mockResolvedValueOnce({ kind, message });
    render(<EmailCodeSignIn />);
    openEmailStep();
    fireEvent.change(emailField(), { target: { value: EMAIL } });

    fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(emailField()).toBeEnabled();
    expect(screen.queryAllByRole("textbox", { name: /^Digit/ })).toHaveLength(0);
  });

  it("shows the backend's refusal of the email under the field", async () => {
    vi.mocked(requestCode).mockResolvedValueOnce({ kind: "invalid", message: "Email wajib diisi" });
    render(<EmailCodeSignIn />);
    openEmailStep();
    fireEvent.change(emailField(), { target: { value: EMAIL } });

    fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));
    await settle();

    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveAccessibleDescription("Email wajib diisi");
  });

  it("clears an earlier problem once the email is typed again", async () => {
    vi.mocked(requestCode).mockResolvedValueOnce({ kind: "not_sent", message: "Kode gagal dikirim. Coba lagi." });
    render(<EmailCodeSignIn />);
    openEmailStep();
    fireEvent.change(emailField(), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));
    fireEvent.change(emailField(), { target: { value: EMAIL } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Kode" }));
    await settle();

    fireEvent.change(emailField(), { target: { value: `${EMAIL}x` } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(emailField()).not.toHaveAttribute("aria-invalid");
  });
});

describe("EmailCodeSignIn: entering the code", () => {
  it("refuses an incomplete code without asking the backend", async () => {
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    typeCode("123");

    submitCode();

    expect(screen.getByRole("alert")).toHaveTextContent("Masukkan 6 digit kode.");
    boxes().forEach((box) => expect(box).toHaveAttribute("aria-invalid", "true"));
    expect(verifyCode).not.toHaveBeenCalled();
  });

  it("checks the code for the email it was sent to and locks the screen while checking", async () => {
    const call = pending<{ kind: "failed" }>();
    vi.mocked(verifyCode).mockReturnValueOnce(call.promise);
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    typeCode("012345");

    submitCode();

    expect(verifyCode).toHaveBeenCalledExactlyOnceWith(EMAIL, "012345");
    expect(screen.getByRole("button", { name: "Memeriksa…" })).toBeDisabled();
    boxes().forEach((box) => expect(box).toBeDisabled());
    expect(screen.getByRole("button", { name: "Ganti email" })).toBeDisabled();
    call.resolve({ kind: "failed" });
    await settle();
  });

  it("checks only once when the code is sent twice while the first check is pending", async () => {
    const call = pending<{ kind: "failed" }>();
    vi.mocked(verifyCode).mockReturnValueOnce(call.promise);
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    typeCode("012345");
    const form = boxes()[0].closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(verifyCode).toHaveBeenCalledTimes(1);
    call.resolve({ kind: "failed" });
    await settle();
  });

  it("goes where the backend says once signed in, with a full page load, and stays locked", async () => {
    vi.mocked(verifyCode).mockResolvedValueOnce({ kind: "signed_in", redirectTo: "/creator/dashboard" });
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    typeCode("012345");

    submitCode();
    await settle();

    expect(assign).toHaveBeenCalledExactlyOnceWith("/creator/dashboard");
    expect(screen.getByRole("button", { name: "Memeriksa…" })).toBeDisabled();
  });

  it.each([
    [{ kind: "wrong", attemptsLeft: 3 }, "Kode salah. Sisa 3 percobaan."],
    [{ kind: "wrong" }, "Kode salah."],
    [{ kind: "invalid" }, "Masukkan 6 digit kode."],
    [{ kind: "expired" }, "Kode sudah kedaluwarsa. Kirim ulang kode."],
    [{ kind: "denied" }, "Akses ditolak. Hubungi Admin untuk meminta akses."],
    [{ kind: "failed" }, "Gagal masuk. Silakan coba lagi."],
  ] as const)("announces %o and clears the boxes for another try", async (outcome, message) => {
    vi.mocked(verifyCode).mockResolvedValueOnce(outcome);
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    typeCode("012345");

    submitCode();
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    boxes().forEach((box) => expect(box).toHaveValue(""));
    expect(boxes()[0]).toHaveFocus();
    expect(screen.getByRole("button", { name: "Masuk" })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("clears the problem once a new code is typed", async () => {
    vi.mocked(verifyCode).mockResolvedValueOnce({ kind: "wrong", attemptsLeft: 4 });
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    typeCode("012345");
    submitCode();
    await settle();

    fireEvent.change(boxes()[0], { target: { value: "9" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // The code is a password for ten minutes: it lives in component state and nowhere else.
  it("never writes the code to browser storage or the console, whatever the answer", async () => {
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const logged = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    vi.mocked(verifyCode)
      .mockResolvedValueOnce({ kind: "wrong", attemptsLeft: 4 })
      .mockResolvedValueOnce({ kind: "signed_in", redirectTo: "/creator/dashboard" });
    render(<EmailCodeSignIn />);
    await reachCodeStep();

    typeCode("111111");
    submitCode();
    await settle();
    typeCode("654321");
    submitCode();
    await settle();

    expect(stored).not.toHaveBeenCalled();
    logged.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(document.cookie).not.toContain("654321");
    stored.mockRestore();
    logged.forEach((spy) => spy.mockRestore());
  });

  it("goes back to the email step on Ganti email, keeping the email typed", async () => {
    render(<EmailCodeSignIn />);
    await reachCodeStep();

    fireEvent.click(screen.getByRole("button", { name: "Ganti email" }));

    expect(emailField()).toHaveValue(EMAIL);
    expect(screen.queryAllByRole("textbox", { name: /^Digit/ })).toHaveLength(0);
  });
});

describe("EmailCodeSignIn: Kirim Ulang", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function resendButton() {
    return screen.getByRole("button", { name: /^Kirim Ulang/ });
  }

  it("shows the seconds left on a locked Kirim Ulang, and unlocks it after 60 seconds", async () => {
    render(<EmailCodeSignIn />);
    await reachCodeStep();

    expect(resendButton()).toBeDisabled();
    expect(resendButton()).toHaveTextContent("Kirim Ulang (60 detik)");
    act(() => vi.advanceTimersByTime(1000));
    expect(resendButton()).toHaveTextContent("Kirim Ulang (59 detik)");
    act(() => vi.advanceTimersByTime(58_000));
    expect(resendButton()).toBeDisabled();
    act(() => vi.advanceTimersByTime(1000));

    expect(resendButton()).toBeEnabled();
    expect(resendButton()).toHaveTextContent(/^Kirim Ulang$/);
  });

  it("asks for a new code for the same email, then counts down again from 60", async () => {
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    typeCode("123");
    act(() => vi.advanceTimersByTime(60_000));
    vi.mocked(requestCode).mockResolvedValueOnce(SENT);

    fireEvent.click(resendButton());
    await settle();

    expect(requestCode).toHaveBeenLastCalledWith(EMAIL);
    expect(requestCode).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Kalau email kamu terdaftar, kode sudah dikirim.");
    expect(resendButton()).toHaveTextContent("Kirim Ulang (60 detik)");
    boxes().forEach((box) => expect(box).toHaveValue(""));
  });

  it("locks the screen while the new code is asked for", async () => {
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    act(() => vi.advanceTimersByTime(60_000));
    const call = pending<typeof SENT>();
    vi.mocked(requestCode).mockReturnValueOnce(call.promise);

    fireEvent.click(resendButton());

    expect(screen.getByRole("button", { name: "Mengirim…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Masuk" })).toBeDisabled();
    call.resolve(SENT);
    await settle();
  });

  it.each([
    ["limited", "Terlalu banyak permintaan. Coba lagi dalam 12 menit."],
    ["not_sent", "Kode gagal dikirim. Coba lagi."],
    ["invalid", "Format email tidak valid"],
  ] as const)("announces a %s answer and leaves Kirim Ulang open", async (kind, message) => {
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    act(() => vi.advanceTimersByTime(60_000));
    vi.mocked(requestCode).mockResolvedValueOnce({ kind, message });

    fireEvent.click(resendButton());
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(resendButton()).toBeEnabled();
  });

  it("leaves no countdown running once the screen goes back to the email step", async () => {
    render(<EmailCodeSignIn />);
    await reachCodeStep();
    const cleared = vi.spyOn(globalThis, "clearInterval");

    fireEvent.click(screen.getByRole("button", { name: "Ganti email" }));

    // React keeps timers of its own, so the countdown's interval is watched being cleared.
    expect(cleared).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(emailField()).toBeEnabled();
    cleared.mockRestore();
  });
});
