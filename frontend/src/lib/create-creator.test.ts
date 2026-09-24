import { createCreator } from "./creators";

describe("createCreator", () => {
  const request = {
    name: "Salsa Amelia",
    email: "salsa@example.com",
    contractStart: "2026-10-01",
    contractEnd: "2026-12-31",
    interval: 14,
    quota: 1,
    fixedRate: 500000,
    socialPlatform: "tiktok" as const,
    contractType: "regular" as const,
    socialUsername: "salsa.amelia",
    deadlines: ["2026-10-06"],
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function respond(status: number, body?: unknown) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(body === undefined ? null : JSON.stringify(body), { status }),
      );
  }

  it("posts the form and its deadlines as JSON to the same-origin API proxy", async () => {
    const fetchSpy = respond(201, { id: "creator-9" });

    await expect(createCreator(request)).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  });

  it("hands back the message for each field the server rejected", async () => {
    respond(422, {
      message: "Data creator tidak valid",
      errors: { email: "Email sudah terdaftar", contractStart: "Tanggal mulai tidak boleh sebelum hari ini" },
    });

    await expect(createCreator(request)).resolves.toEqual({
      ok: false,
      message: "Data creator tidak valid",
      errors: { email: "Email sudah terdaftar", contractStart: "Tanggal mulai tidak boleh sebelum hari ini" },
    });
  });

  // Only form fields the modal can show are kept; anything else in the body is dropped.
  it("keeps only string messages for fields the form knows", async () => {
    respond(422, { errors: { email: "Email sudah terdaftar", is_admin: "x", quota: 3 } });

    await expect(createCreator(request)).resolves.toEqual({
      ok: false,
      message: "Data creator tidak valid",
      errors: { email: "Email sudah terdaftar" },
    });
  });

  it("falls back to a general message when a 422 has no readable body", async () => {
    respond(422);

    await expect(createCreator(request)).resolves.toEqual({
      ok: false,
      message: "Data creator tidak valid",
      errors: {},
    });
  });

  it("reports any other failure as a retryable save error", async () => {
    respond(500, { message: "Internal server error" });

    await expect(createCreator(request)).resolves.toEqual({
      ok: false,
      message: "Creator gagal disimpan. Coba lagi.",
      errors: {},
    });
  });

  it("reports a network failure the same way", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(createCreator(request)).resolves.toEqual({
      ok: false,
      message: "Creator gagal disimpan. Coba lagi.",
      errors: {},
    });
  });
});
