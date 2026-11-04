import { requestSignInCode, verifySignInCode } from "./email-sign-in-api";

function answer(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("requestSignInCode", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the email as JSON to the same-origin proxy", async () => {
    vi.mocked(fetch).mockResolvedValue(answer(200, { resendAfterSeconds: 60 }));

    await requestSignInCode("rangga@example.com");

    expect(fetch).toHaveBeenCalledWith("/api/auth/email/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "rangga@example.com" }),
    });
  });

  it("reads a 200 as sent, with the resend wait the backend gives", async () => {
    vi.mocked(fetch).mockResolvedValue(answer(200, { resendAfterSeconds: 45 }));

    await expect(requestSignInCode("a@example.com")).resolves.toEqual({
      kind: "sent",
      resendAfterSeconds: 45,
    });
  });

  it("reads a 429 as limited, with the minutes to wait", async () => {
    vi.mocked(fetch).mockResolvedValue(
      answer(429, { code: "TOO_MANY_REQUESTS", minutesToWait: 17 }),
    );

    await expect(requestSignInCode("a@example.com")).resolves.toEqual({
      kind: "limited",
      minutes: 17,
    });
  });

  it("reads a 422 as the field error the backend named", async () => {
    vi.mocked(fetch).mockResolvedValue(
      answer(422, { message: "Data tidak valid", errors: { email: "Format email tidak valid" } }),
    );

    await expect(requestSignInCode("a@")).resolves.toEqual({
      kind: "invalid",
      message: "Format email tidak valid",
    });
  });

  it.each([
    ["a 503", () => Promise.resolve(answer(503, { code: "CODE_SEND_FAILED" }))],
    ["a 502 from the proxy", () => Promise.resolve(answer(502, { error: "Bad gateway" }))],
    ["a 403 from the origin check", () => Promise.resolve(answer(403, {}))],
    ["no network", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("reads %s as a code that was not sent", async (_label, reply) => {
    vi.mocked(fetch).mockImplementation(reply);

    await expect(requestSignInCode("a@example.com")).resolves.toEqual({ kind: "send_failed" });
  });

  // A Tolerant Reader: an answer missing a number, or holding a nonsense one, still reads as
  // something the screen can say, never as "Coba lagi dalam NaN menit".
  it.each([
    ["no body", answer(200), { kind: "sent", resendAfterSeconds: 60 }],
    ["text", new Response("ok", { status: 200 }), { kind: "sent", resendAfterSeconds: 60 }],
    ["a negative wait", answer(200, { resendAfterSeconds: -5 }), { kind: "sent", resendAfterSeconds: 60 }],
    ["a fraction", answer(429, { minutesToWait: 2.5 }), { kind: "limited", minutes: 60 }],
    ["a string", answer(429, { minutesToWait: "17" }), { kind: "limited", minutes: 60 }],
    ["a list", answer(429, [17]), { kind: "limited", minutes: 60 }],
    ["no field error", answer(422, { message: "x" }), { kind: "invalid", message: "Format email tidak valid" }],
    ["a field error that is not text", answer(422, { errors: { email: 1 } }), { kind: "invalid", message: "Format email tidak valid" }],
  ])("falls back to a safe value for %s", async (_label, response, outcome) => {
    vi.mocked(fetch).mockResolvedValue(response);

    await expect(requestSignInCode("a@example.com")).resolves.toEqual(outcome);
  });
});

describe("verifySignInCode", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the email and the code as JSON to the same-origin proxy", async () => {
    vi.mocked(fetch).mockResolvedValue(answer(200, { redirectTo: "/creator/dashboard" }));

    await verifySignInCode("rangga@example.com", "123456");

    expect(fetch).toHaveBeenCalledWith("/api/auth/email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "rangga@example.com", code: "123456" }),
    });
  });

  it.each(["/creator/dashboard", "/admin/creators"])(
    "reads a 200 as signed in, going to the role's home %s (AC 10)",
    async (redirectTo) => {
      vi.mocked(fetch).mockResolvedValue(answer(200, { redirectTo }));

      await expect(verifySignInCode("a@example.com", "123456")).resolves.toEqual({
        kind: "signed_in",
        redirectTo,
      });
    },
  );

  // Only a role's home is followed: an answer naming any other place, here or on another site,
  // sends the browser to "/", which routes a signed-in user home itself (OWASP A01).
  it.each([
    ["another site", "https://evil.example/creator/dashboard"],
    ["a protocol-relative link", "//evil.example"],
    ["another page", "/admin/invoices"],
    ["nothing", undefined],
  ])("goes to / instead of %s", async (_label, redirectTo) => {
    vi.mocked(fetch).mockResolvedValue(answer(200, { redirectTo }));

    await expect(verifySignInCode("a@example.com", "123456")).resolves.toEqual({
      kind: "signed_in",
      redirectTo: "/",
    });
  });

  it("reads CODE_WRONG as wrong, with the attempts left (AC 7)", async () => {
    vi.mocked(fetch).mockResolvedValue(answer(422, { code: "CODE_WRONG", attemptsLeft: 3 }));

    await expect(verifySignInCode("a@example.com", "000000")).resolves.toEqual({
      kind: "wrong",
      attemptsLeft: 3,
    });
  });

  it.each([0, 5, 2.5, "3", undefined])(
    "reads CODE_WRONG with attempts %j, which no live code has, as expired",
    async (attemptsLeft) => {
      vi.mocked(fetch).mockResolvedValue(answer(422, { code: "CODE_WRONG", attemptsLeft }));

      await expect(verifySignInCode("a@example.com", "000000")).resolves.toEqual({
        kind: "expired",
      });
    },
  );

  it("reads a 410 as expired, which also covers the fifth wrong attempt (AC 8, 9)", async () => {
    vi.mocked(fetch).mockResolvedValue(answer(410, { code: "CODE_EXPIRED" }));

    await expect(verifySignInCode("a@example.com", "000000")).resolves.toEqual({ kind: "expired" });
  });

  it("reads ACCESS_DENIED as denied (AC 11)", async () => {
    vi.mocked(fetch).mockResolvedValue(answer(403, { code: "ACCESS_DENIED" }));

    await expect(verifySignInCode("a@example.com", "123456")).resolves.toEqual({ kind: "denied" });
  });

  it.each([
    ["the code", { errors: { code: "Kode harus 6 digit" } }, "Kode harus 6 digit"],
    ["the email", { errors: { email: "Format email tidak valid" } }, "Format email tidak valid"],
    ["nothing", { message: "Data tidak valid" }, "Kode harus 6 digit"],
  ])("reads a 422 naming %s as invalid", async (_label, body, message) => {
    vi.mocked(fetch).mockResolvedValue(answer(422, body));

    await expect(verifySignInCode("a@example.com", "12")).resolves.toEqual({
      kind: "invalid",
      message,
    });
  });

  it.each([
    ["SIGN_IN_FAILED", () => Promise.resolve(answer(503, { code: "SIGN_IN_FAILED" }))],
    ["the origin check's 403", () => Promise.resolve(answer(403, {}))],
    ["a 502 from the proxy", () => Promise.resolve(answer(502))],
    ["no network", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("reads %s as failed", async (_label, reply) => {
    vi.mocked(fetch).mockImplementation(reply);

    await expect(verifySignInCode("a@example.com", "123456")).resolves.toEqual({ kind: "failed" });
  });
});
