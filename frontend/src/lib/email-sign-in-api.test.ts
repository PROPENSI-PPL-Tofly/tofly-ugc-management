import { requestSignInCode } from "./email-sign-in-api";

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
