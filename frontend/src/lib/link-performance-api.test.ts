import { saveManualPerformance, syncContentPerformance, syncLinkPerformance } from "./link-performance-api";

const CONTENT_ID = "11111111-1111-4111-8111-111111111111";
const VALUES = { views: 12400, likes: null, comments: 41, shares: null };
const SAVED = { platform: "instagram", url: "https://instagram.com/reel/x", ...VALUES, state: "manual" };

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

describe("saveManualPerformance (PBI-27 AC 14-18)", () => {
  it("puts the four numbers to the link's own platform, empty ones as null", async () => {
    const fetchSpy = respond(answer(200, SAVED));

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({ ok: true });

    expect(fetchSpy).toHaveBeenCalledWith(`/api/contents/${CONTENT_ID}/links/instagram/performance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALUES),
    });
  });

  it("encodes the content id, so a crafted one cannot reach another route", async () => {
    const fetchSpy = respond(answer(200, SAVED));

    await saveManualPerformance("../x?y", "tiktok", VALUES);

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/contents/..%2Fx%3Fy/links/tiktok/performance");
  });

  it("gives each refused field its own message from a 422", async () => {
    respond(
      answer(422, {
        message: "Angka performa tidak valid",
        // A field the form does not show, and a message that is not text, are both left out.
        errors: { views: "Isi bilangan bulat 0 sampai 999.999.999", other: "ignored", likes: 5 },
      }),
    );

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({
      ok: false,
      message: "Angka performa tidak valid",
      errors: { views: "Isi bilangan bulat 0 sampai 999.999.999" },
    });
  });

  it("keeps only the message when none of the refused fields is one the form shows", async () => {
    respond(answer(422, { message: "Angka performa tidak valid", errors: { other: "ignored" } }));

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({
      ok: false,
      message: "Angka performa tidak valid",
    });
  });

  it("passes on the lock after finalize in the API's words (AC 18)", async () => {
    respond(
      answer(409, {
        code: "INVOICE_FINALIZED",
        message: "Invoice sudah difinalisasi. Koreksi lewat penyesuaian.",
      }),
    );

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({
      ok: false,
      code: "INVOICE_FINALIZED",
      message: "Invoice sudah difinalisasi. Koreksi lewat penyesuaian.",
    });
  });

  it.each([
    ["a server error", answer(500, { message: "Internal server error" })],
    ["an unreadable body", new Response("<html>", { status: 502 })],
  ])("words %s as a plain retry", async (_label, response) => {
    respond(response);

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({
      ok: false,
      message: "Angka performa gagal disimpan. Coba lagi.",
    });
  });

  it("words a 403 without a code (a proxy or guard talking) as a plain retry", async () => {
    respond(answer(403, { message: "Forbidden resource" }));

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({
      ok: false,
      message: "Angka performa gagal disimpan. Coba lagi.",
    });
  });

  it("keeps the code but falls back to a plain message when the refusal has none", async () => {
    respond(answer(409, { code: "LINK_CHANGED" }));

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({
      ok: false,
      code: "LINK_CHANGED",
      message: "Angka performa gagal disimpan. Coba lagi.",
    });
  });

  it("words a dropped connection as a plain retry", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(saveManualPerformance(CONTENT_ID, "instagram", VALUES)).resolves.toEqual({
      ok: false,
      message: "Angka performa gagal disimpan. Coba lagi.",
    });
  });
});

describe("syncContentPerformance (PBI-27 AC 12-13)", () => {
  it("posts to the content's sync and says the numbers were updated", async () => {
    const fetchSpy = respond(answer(200, { notUpdated: [] }));

    await expect(syncContentPerformance(CONTENT_ID)).resolves.toEqual({
      ok: true,
      toast: "Data performa diperbarui",
    });
    expect(fetchSpy).toHaveBeenCalledWith(`/api/contents/${CONTENT_ID}/performance-sync`, {
      method: "POST",
    });
  });

  it("says some links failed when the sync names any it could not update", async () => {
    respond(answer(200, { notUpdated: [{ platform: "tiktok" }] }));

    await expect(syncContentPerformance(CONTENT_ID)).resolves.toEqual({
      ok: true,
      toast: "Sebagian link gagal disinkronkan",
    });
  });

  it("says a sync is already running on a 409", async () => {
    respond(answer(409, { code: "SYNC_RUNNING" }));

    await expect(syncContentPerformance(CONTENT_ID)).resolves.toEqual({
      ok: false,
      message: "Konten ini sedang disinkronkan. Tunggu sebentar.",
    });
  });

  it("says the sync is not there yet while the backend has no such route", async () => {
    respond(answer(404, { message: "Cannot POST" }));

    await expect(syncContentPerformance(CONTENT_ID)).resolves.toEqual({
      ok: false,
      message: "Sinkronisasi otomatis belum tersedia.",
    });
  });

  it("words a server error as a plain retry", async () => {
    respond(answer(500, { message: "Internal server error" }));

    await expect(syncContentPerformance(CONTENT_ID)).resolves.toEqual({
      ok: false,
      message: "Sinkronisasi gagal. Coba lagi.",
    });
  });

  it("words any other failure as a plain retry", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(syncContentPerformance(CONTENT_ID)).resolves.toEqual({
      ok: false,
      message: "Sinkronisasi gagal. Coba lagi.",
    });
  });
});

// SCRUM-282: the Refresh button on one link card syncs only that card's link.
describe("syncLinkPerformance (SCRUM-282)", () => {
  it("posts to that link's own sync and names its platform when updated", async () => {
    const fetchSpy = respond(answer(200, { notUpdated: [] }));

    await expect(syncLinkPerformance(CONTENT_ID, "instagram")).resolves.toEqual({
      ok: true,
      toast: "Data performa Instagram diperbarui",
    });
    expect(fetchSpy).toHaveBeenCalledWith(`/api/contents/${CONTENT_ID}/links/instagram/performance-sync`, {
      method: "POST",
    });
  });

  it("says that link could not be updated when the sync names it", async () => {
    respond(answer(200, { notUpdated: [{ platform: "tiktok" }] }));

    await expect(syncLinkPerformance(CONTENT_ID, "tiktok")).resolves.toEqual({
      ok: true,
      toast: "Link TikTok gagal disinkronkan",
    });
  });

  it("encodes the content id, so a crafted one cannot reach another route", async () => {
    const fetchSpy = respond(answer(200, { notUpdated: [] }));

    await syncLinkPerformance("../users", "tiktok");

    expect(fetchSpy).toHaveBeenCalledWith("/api/contents/..%2Fusers/links/tiktok/performance-sync", {
      method: "POST",
    });
  });

  it.each([
    ["a sync already running on a 409", answer(409, { code: "SYNC_RUNNING" }), "Konten ini sedang disinkronkan. Tunggu sebentar."],
    ["a backend without the route yet", answer(404, { message: "Cannot POST" }), "Sinkronisasi otomatis belum tersedia."],
    ["a server error", answer(500, { message: "Internal server error" }), "Sinkronisasi gagal. Coba lagi."],
  ])("words %s as Sinkronkan Sekarang does", async (_what, response, message) => {
    respond(response);

    await expect(syncLinkPerformance(CONTENT_ID, "tiktok")).resolves.toEqual({ ok: false, message });
  });

  it("words a dropped connection as a plain retry", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(syncLinkPerformance(CONTENT_ID, "instagram")).resolves.toEqual({
      ok: false,
      message: "Sinkronisasi gagal. Coba lagi.",
    });
  });
});
