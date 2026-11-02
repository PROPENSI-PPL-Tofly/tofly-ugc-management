import { LINK_TAKEN_MESSAGE, saveVideoLinks } from "./video-links-api";

const CONTENT_ID = "11111111-1111-4111-8111-111111111111";
const INSTAGRAM_REEL = "https://www.instagram.com/reel/C8abc12345/";
const TIKTOK_VIDEO = "https://www.tiktok.com/@tofly/video/7400000000000000000";

const SAVE_FAILED = "Link video gagal dikirim. Coba lagi.";

function answer(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function respond(...answers: Response[]) {
  const spy = vi.spyOn(globalThis, "fetch");
  for (const next of answers) spy.mockResolvedValueOnce(next);
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveVideoLinks", () => {
  it("posts every new link in one request to the content's links", async () => {
    const fetchSpy = respond(answer(201, { links: [] }));

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [
          { platform: "instagram", url: INSTAGRAM_REEL },
          { platform: "tiktok", url: TIKTOK_VIDEO },
        ],
        replaced: [],
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(`/api/contents/${CONTENT_ID}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: { instagram: INSTAGRAM_REEL, tiktok: TIKTOK_VIDEO } }),
    });
  });

  it("puts a replaced link to its own platform's address", async () => {
    const fetchSpy = respond(answer(200, {}));

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [],
        replaced: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchSpy).toHaveBeenCalledWith(`/api/contents/${CONTENT_ID}/links/tiktok`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: TIKTOK_VIDEO }),
    });
  });

  it("adds first and then replaces, when both are asked at once", async () => {
    const fetchSpy = respond(answer(201, {}), answer(200, {}));

    await saveVideoLinks(CONTENT_ID, {
      added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
      replaced: [{ platform: "instagram", url: INSTAGRAM_REEL }],
    });

    expect(fetchSpy.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      `POST /api/contents/${CONTENT_ID}/links`,
      `PUT /api/contents/${CONTENT_ID}/links/instagram`,
    ]);
  });

  it("encodes the content id, so a crafted id cannot reach another route", async () => {
    const fetchSpy = respond(answer(201, {}));

    await saveVideoLinks("a/../b", {
      added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
      replaced: [],
    });

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/contents/a%2F..%2Fb/links");
  });

  it("names what was already saved when a replace is refused after an add went through", async () => {
    respond(answer(201, {}), answer(409, { code: "INVOICE_FINALIZED", message: "Invoice terkunci" }));

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
        replaced: [{ platform: "instagram", url: INSTAGRAM_REEL }],
      }),
    ).resolves.toEqual({
      ok: false,
      code: "INVOICE_FINALIZED",
      message: "Invoice terkunci",
      saved: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
    });
  });

  it("names the earlier replace as saved when a later one is refused", async () => {
    respond(answer(200, {}), answer(422, { message: "Data", errors: { tiktok: "Salah" } }));

    const result = await saveVideoLinks(CONTENT_ID, {
      added: [],
      replaced: [
        { platform: "instagram", url: INSTAGRAM_REEL },
        { platform: "tiktok", url: TIKTOK_VIDEO },
      ],
    });

    expect(result).toMatchObject({
      errors: { tiktok: "Salah" },
      saved: [{ platform: "instagram", url: INSTAGRAM_REEL }],
    });
  });

  it("stops at the first refusal and sends nothing after it", async () => {
    const fetchSpy = respond(answer(422, { message: "Link tidak valid" }));

    const result = await saveVideoLinks(CONTENT_ID, {
      added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
      replaced: [{ platform: "instagram", url: INSTAGRAM_REEL }],
    });

    expect(result.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("hands back each field's message the server sends", async () => {
    respond(
      answer(422, {
        message: "Link tidak valid",
        errors: { instagram: "Link harus dari Instagram", tiktok: 42, youtube: "x" },
      }),
    );

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [{ platform: "instagram", url: INSTAGRAM_REEL }],
        replaced: [],
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Link tidak valid",
      errors: { instagram: "Link harus dari Instagram" },
    });
  });

  it("keeps the nothing-filled answer as a message for the whole form", async () => {
    respond(answer(422, { message: "Data link video tidak valid", errors: { links: "Isi minimal satu" } }));

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
        replaced: [],
      }),
    ).resolves.toEqual({ ok: false, message: "Data link video tidak valid" });
  });

  it("puts a link already used on another content under its own field", async () => {
    respond(answer(409, { code: "VIDEO_LINK_TAKEN", message: "Conflict", platform: "tiktok" }));

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
        replaced: [],
      }),
    ).resolves.toEqual({
      ok: false,
      code: "VIDEO_LINK_TAKEN",
      message: LINK_TAKEN_MESSAGE,
      errors: { tiktok: LINK_TAKEN_MESSAGE },
    });
  });

  it("puts a taken link under the only field that was sent when the server names none", async () => {
    respond(answer(409, { code: "VIDEO_LINK_TAKEN" }));

    const result = await saveVideoLinks(CONTENT_ID, {
      added: [],
      replaced: [{ platform: "instagram", url: INSTAGRAM_REEL }],
    });

    expect(result).toMatchObject({ errors: { instagram: LINK_TAKEN_MESSAGE } });
  });

  it("keeps a taken link as a general message when several were sent and none is named", async () => {
    respond(answer(409, { code: "VIDEO_LINK_TAKEN" }));

    const result = await saveVideoLinks(CONTENT_ID, {
      added: [
        { platform: "instagram", url: INSTAGRAM_REEL },
        { platform: "tiktok", url: TIKTOK_VIDEO },
      ],
      replaced: [],
    });

    expect(result).toEqual({ ok: false, code: "VIDEO_LINK_TAKEN", message: LINK_TAKEN_MESSAGE });
  });

  it("passes on another refusal's code and message, such as a finalized invoice", async () => {
    respond(answer(409, { code: "INVOICE_FINALIZED", message: "Invoice sudah difinalisasi" }));

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [],
        replaced: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
      }),
    ).resolves.toEqual({
      ok: false,
      code: "INVOICE_FINALIZED",
      message: "Invoice sudah difinalisasi",
    });
  });

  it.each([
    ["an empty body", answer(500)],
    ["a body that is not JSON", new Response("<html>", { status: 502 })],
    ["a body with no message", answer(500, { code: 7 })],
    ["the framework's own missing-route text", answer(404, { message: "Cannot POST /contents/x/links", statusCode: 404 })],
    ["the framework's own server error text", answer(500, { message: "Internal server error", statusCode: 500 })],
    ["a coded server error", answer(503, { code: "DOWN", message: "db pool exhausted" })],
  ])("answers %s with one retryable message", async (_, response) => {
    respond(response);

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
        replaced: [],
      }),
    ).resolves.toEqual({ ok: false, message: SAVE_FAILED });
  });

  it("answers a dropped connection with the same retryable message instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));

    await expect(
      saveVideoLinks(CONTENT_ID, {
        added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
        replaced: [],
      }),
    ).resolves.toEqual({ ok: false, message: SAVE_FAILED });
  });
});
