import { EMAIL_SIGN_IN_TEXT } from "@/lib/email-sign-in-messages";
import {
  CLOSED,
  emailProblem,
  emailSignInFlow,
  type CodeStep,
  type EmailStep,
  type Flow,
} from "./email-sign-in-flow";

const EMAIL = "rangga@example.com";

const EMAIL_STEP: EmailStep = {
  step: "email",
  email: EMAIL,
  busy: false,
  error: null,
  fieldError: null,
};

const CODE_STEP: CodeStep = {
  step: "code",
  email: EMAIL,
  code: "",
  busy: false,
  notice: EMAIL_SIGN_IN_TEXT.sent,
  error: null,
  invalid: false,
};

describe("emailProblem", () => {
  it.each([
    ["", "Email wajib diisi"],
    ["   ", "Email wajib diisi"],
    ["rangga.example.com", "Format email tidak valid"],
    [`${"a".repeat(64)}@${"b".repeat(186)}.com`, "Email maksimal 254 karakter"],
  ])("refuses %j before anything is sent (AC 2)", (email, problem) => {
    expect(emailProblem(email)).toBe(problem);
  });

  it("accepts a valid email of up to 254 characters", () => {
    expect(emailProblem(` ${EMAIL} `)).toBeNull();
    expect(emailProblem(`${"a".repeat(64)}@${"b".repeat(185)}.com`)).toBeNull();
  });
});

describe("emailSignInFlow", () => {
  it("starts closed, with only the two ways in on the page (AC 1)", () => {
    expect(CLOSED).toEqual({ step: "closed" });
  });

  it("opens on an empty email step", () => {
    expect(emailSignInFlow(CLOSED, { type: "open" })).toEqual({ ...EMAIL_STEP, email: "" });
  });

  it("keeps the typed email and clears its field error", () => {
    expect(
      emailSignInFlow({ ...EMAIL_STEP, fieldError: "x" }, { type: "emailTyped", email: "a@b.co" }),
    ).toEqual({ ...EMAIL_STEP, email: "a@b.co" });
  });

  it("names a bad email under the field without sending it", () => {
    expect(emailSignInFlow({ ...EMAIL_STEP, email: "nope" }, { type: "emailRefused", problem: "P" }))
      .toEqual({ ...EMAIL_STEP, email: "nope", fieldError: "P" });
  });

  it.each([
    ["the email step", { ...EMAIL_STEP, error: "old" }],
    ["the code step, resending", { ...CODE_STEP, error: "old" }],
  ])("is busy and quiet while a code is requested from %s", (_label, from: Flow) => {
    expect(emailSignInFlow(from, { type: "requestStarted" })).toEqual({
      ...from,
      busy: true,
      error: null,
    });
  });

  describe("a code request's answer on the email step", () => {
    const busy: EmailStep = { ...EMAIL_STEP, busy: true };

    it("moves on to the code step saying a code was sent, whoever asked (AC 2)", () => {
      expect(
        emailSignInFlow(busy, {
          type: "requestAnswered",
          outcome: { kind: "sent", resendAfterSeconds: 60 },
        }),
      ).toEqual(CODE_STEP);
    });

    it.each([
      [{ kind: "limited", minutes: 12 } as const, { error: "Terlalu banyak permintaan. Coba lagi dalam 12 menit." }],
      [{ kind: "send_failed" } as const, { error: EMAIL_SIGN_IN_TEXT.sendFailed }],
      [{ kind: "invalid", message: "Format email tidak valid" } as const, { fieldError: "Format email tidak valid" }],
    ])("stays on the email step for %j", (outcome, shown) => {
      expect(emailSignInFlow(busy, { type: "requestAnswered", outcome })).toEqual({
        ...EMAIL_STEP,
        ...shown,
      });
    });
  });

  describe("a resend's answer on the code step", () => {
    const busy: CodeStep = { ...CODE_STEP, code: "12", busy: true, invalid: true, notice: null };

    it("clears the boxes and says again that a code was sent (AC 4)", () => {
      expect(
        emailSignInFlow(busy, {
          type: "requestAnswered",
          outcome: { kind: "sent", resendAfterSeconds: 60 },
        }),
      ).toEqual(CODE_STEP);
    });

    it.each([
      [{ kind: "limited", minutes: 3 } as const, "Terlalu banyak permintaan. Coba lagi dalam 3 menit."],
      [{ kind: "send_failed" } as const, EMAIL_SIGN_IN_TEXT.sendFailed],
      [{ kind: "invalid", message: "Format email tidak valid" } as const, "Format email tidak valid"],
    ])("keeps the boxes and shows the refusal for %j (AC 5, 6)", (outcome, error) => {
      expect(emailSignInFlow(busy, { type: "requestAnswered", outcome })).toEqual({
        ...busy,
        busy: false,
        error,
      });
    });
  });

  it("keeps the typed code and clears the wrong-code marks", () => {
    expect(
      emailSignInFlow({ ...CODE_STEP, invalid: true }, { type: "codeTyped", code: "48" }),
    ).toEqual({ ...CODE_STEP, code: "48" });
  });

  it("is busy and quiet while a code is checked", () => {
    expect(emailSignInFlow({ ...CODE_STEP, code: "482913" }, { type: "verifyStarted" })).toEqual({
      ...CODE_STEP,
      code: "482913",
      busy: true,
      notice: null,
    });
  });

  describe("a check's answer", () => {
    const busy: CodeStep = { ...CODE_STEP, code: "482913", busy: true, notice: null };

    it("stays busy once signed in, while the browser leaves for the home page (AC 10)", () => {
      expect(
        emailSignInFlow(busy, {
          type: "verifyAnswered",
          outcome: { kind: "signed_in", redirectTo: "/creator/dashboard" },
        }),
      ).toEqual(busy);
    });

    it.each([
      [{ kind: "wrong", attemptsLeft: 4 } as const, "Kode salah. Sisa 4 percobaan.", true],
      [{ kind: "expired" } as const, EMAIL_SIGN_IN_TEXT.expired, true],
      [{ kind: "denied" } as const, EMAIL_SIGN_IN_TEXT.denied, false],
      [{ kind: "failed" } as const, EMAIL_SIGN_IN_TEXT.signInFailed, false],
      [{ kind: "invalid", message: "Kode harus 6 digit" } as const, "Kode harus 6 digit", true],
    ])("empties the boxes and says why for %j (AC 7, 9, 11)", (outcome, error, invalid) => {
      expect(emailSignInFlow(busy, { type: "verifyAnswered", outcome })).toEqual({
        ...busy,
        code: "",
        busy: false,
        error,
        invalid,
      });
    });
  });

  it("goes back to the email step, keeping the email, to change it", () => {
    expect(emailSignInFlow({ ...CODE_STEP, code: "12" }, { type: "changeEmail" })).toEqual(
      EMAIL_STEP,
    );
  });

  // An answer that arrives for a step the screen has left changes nothing.
  it.each([
    ["a typed email on the code step", CODE_STEP, { type: "emailTyped", email: "x" }],
    ["a typed code on the email step", EMAIL_STEP, { type: "codeTyped", code: "1" }],
    ["a check's answer on the email step", EMAIL_STEP, { type: "verifyAnswered", outcome: { kind: "failed" } }],
    ["a request started while closed", CLOSED, { type: "requestStarted" }],
    ["a request's answer while closed", CLOSED, { type: "requestAnswered", outcome: { kind: "send_failed" } }],
    ["opening twice", EMAIL_STEP, { type: "open" }],
    ["a refusal on the code step", CODE_STEP, { type: "emailRefused", problem: "P" }],
    ["checking from the email step", EMAIL_STEP, { type: "verifyStarted" }],
    ["changing email on the email step", EMAIL_STEP, { type: "changeEmail" }],
  ] as const)("ignores %s", (_label, from: Flow, event) => {
    expect(emailSignInFlow(from, event)).toBe(from);
  });
});
