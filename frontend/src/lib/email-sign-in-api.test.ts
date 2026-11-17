import { requestCode, verifyCode } from "./email-sign-in-api";

const EMAIL = "rangga@example.com";

function answer(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestCode (POST /auth/email/request, 39.2)", () => {
  it("posts only the email as JSON to the same-origin proxy, never from a cache", async () => {
    const fetchMock = stubFetch(answer(200, { message: "x" }));

    await requestCode(EMAIL);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/email/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL }),
      cache: "no-store",
    });
  });

  it("reads 200 as sent, with the one answer every address gets", async () => {
    stubFetch(answer(200, { message: "Kalau email kamu terdaftar, kode sudah dikirim." }));

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "sent",
      message: "Kalau email kamu terdaftar, kode sudah dikirim.",
    });
  });

  it("reads 429 as limited, with the wait the backend gives in minutes", async () => {
    stubFetch(
      answer(429, {
        code: "TOO_MANY_REQUESTS",
        message: "Terlalu banyak permintaan. Coba lagi dalam 42 menit.",
        retryAfterMinutes: 42,
      }),
    );

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "limited",
      message: "Terlalu banyak permintaan. Coba lagi dalam 42 menit.",
    });
  });

  it.each([
    ["no wait at all", {}],
    ["a wait that is not a whole number of minutes", { retryAfterMinutes: "soon" }],
    ["a negative wait", { retryAfterMinutes: -3 }],
  ])("words a 429 with %s without a number", async (_, body) => {
    stubFetch(answer(429, { code: "TOO_MANY_REQUESTS", ...body }));

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "limited",
      message: "Terlalu banyak permintaan. Coba lagi nanti.",
    });
  });

  it("reads 503 as not sent", async () => {
    stubFetch(answer(503, { code: "CODE_NOT_SENT", message: "Kode gagal dikirim. Coba lagi." }));

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "not_sent",
      message: "Kode gagal dikirim. Coba lagi.",
    });
  });

  it("shows the field message of a 422 the backend wrote for the email", async () => {
    stubFetch(answer(422, { message: "Data tidak valid", errors: { email: "Email wajib diisi" } }));

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "invalid",
      message: "Email wajib diisi",
    });
  });

  it("falls back to the format message for a 422 without one", async () => {
    stubFetch(answer(422, { message: "Data tidak valid" }));

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "invalid",
      message: "Format email tidak valid",
    });
  });

  // OWASP A10: an answer nobody planned for, or no answer, never shows raw server text.
  it.each([
    ["a 500", answer(500, { message: "PrismaClientKnownRequestError at rangga@example.com" })],
    ["a 403 from another origin", answer(403, { message: "Forbidden resource" })],
    ["a body that is not JSON", new Response("<html>", { status: 502 })],
  ])("reads %s as not sent, in its own words", async (_, response) => {
    stubFetch(response);

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "not_sent",
      message: "Kode gagal dikirim. Coba lagi.",
    });
  });

  it("reads a network failure as not sent", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    await expect(requestCode(EMAIL)).resolves.toEqual({
      kind: "not_sent",
      message: "Kode gagal dikirim. Coba lagi.",
    });
  });
});

describe("verifyCode (POST /auth/email/verify, 39.3)", () => {
  it("posts the email and the code as JSON to the same-origin proxy, never from a cache", async () => {
    const fetchMock = stubFetch(answer(200, { redirectTo: "/creator/dashboard" }));

    await verifyCode(EMAIL, "012345");

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, code: "012345" }),
      cache: "no-store",
    });
  });

  it.each(["/admin/creators", "/creator/dashboard"])(
    "reads 200 as signed in, following %s, a role's home",
    async (home) => {
      stubFetch(answer(200, { redirectTo: home }));

      await expect(verifyCode(EMAIL, "012345")).resolves.toEqual({
        kind: "signed_in",
        redirectTo: home,
      });
    },
  );

  // OWASP A01: the destination of a sign-in is never taken from a response as it came.
  it.each([
    ["another site", "https://evil.example/admin/creators"],
    ["a protocol-relative link", "//evil.example"],
    ["a script URL", "javascript:alert(1)"],
    ["another page of the app", "/admin/invoicing"],
    ["no destination", undefined],
  ])("goes to / instead of %s", async (_, redirectTo) => {
    stubFetch(answer(200, { redirectTo }));

    await expect(verifyCode(EMAIL, "012345")).resolves.toEqual({
      kind: "signed_in",
      redirectTo: "/",
    });
  });

  it("reads 422 CODE_WRONG as a wrong code with the attempts the backend says are left", async () => {
    stubFetch(answer(422, { code: "CODE_WRONG", attemptsLeft: 3 }));

    await expect(verifyCode(EMAIL, "012345")).resolves.toEqual({ kind: "wrong", attemptsLeft: 3 });
  });

  it("reads a CODE_WRONG without a usable count as a wrong code with no count", async () => {
    stubFetch(answer(422, { code: "CODE_WRONG", attemptsLeft: "many" }));

    await expect(verifyCode(EMAIL, "012345")).resolves.toEqual({ kind: "wrong" });
  });

  it("reads any other 422 as a code the backend refused to read", async () => {
    stubFetch(answer(422, { message: "Data tidak valid", errors: { code: "Kode harus 6 digit" } }));

    await expect(verifyCode(EMAIL, "01234")).resolves.toEqual({ kind: "invalid" });
  });

  it.each([
    [410, { code: "CODE_EXPIRED" }, "expired"],
    [403, { code: "ACCESS_DENIED" }, "denied"],
    [503, { code: "SIGN_IN_FAILED" }, "failed"],
  ])("reads %i as %s", async (status, body, kind) => {
    stubFetch(answer(status, body));

    await expect(verifyCode(EMAIL, "012345")).resolves.toEqual({ kind });
  });

  it.each([
    ["a 500", answer(500, { message: "boom" })],
    ["a 403 without ACCESS_DENIED", answer(403, { message: "Forbidden resource" })],
    ["a body that is not JSON", new Response("<html>", { status: 502 })],
  ])("reads %s as failed", async (_, response) => {
    stubFetch(response);

    await expect(verifyCode(EMAIL, "012345")).resolves.toEqual({ kind: "failed" });
  });

  it("reads a network failure as failed", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    await expect(verifyCode(EMAIL, "012345")).resolves.toEqual({ kind: "failed" });
  });
});
