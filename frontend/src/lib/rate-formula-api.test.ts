import { draftFromView, toRateFormulaRequest } from "./rate-formula";
import { SAVED_FORMULA } from "./rate-formula.fixture";
import { fetchRateFormula, saveRateFormula } from "./rate-formula-api";

const request = toRateFormulaRequest(draftFromView(SAVED_FORMULA));

function respond(status: number, body?: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchRateFormula", () => {
  it("reads the saved formula through the same-origin API proxy, never from a cache", async () => {
    const fetchSpy = respond(200, SAVED_FORMULA);

    await expect(fetchRateFormula()).resolves.toEqual(SAVED_FORMULA);
    expect(fetchSpy).toHaveBeenCalledWith("/api/rate-formula", { cache: "no-store" });
  });

  it("throws, naming the status, when the backend answers with an error", async () => {
    respond(500);

    await expect(fetchRateFormula()).rejects.toThrow("HTTP 500");
  });

  it("throws when the request itself fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));

    await expect(fetchRateFormula()).rejects.toThrow("network down");
  });
});

describe("saveRateFormula", () => {
  it("puts the formula as JSON and hands back what the server saved", async () => {
    const fetchSpy = respond(200, SAVED_FORMULA);

    await expect(saveRateFormula(request)).resolves.toEqual({ ok: true, formula: SAVED_FORMULA });
    expect(fetchSpy).toHaveBeenCalledWith("/api/rate-formula", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  });

  it("hands back the message for each amount the server rejected", async () => {
    respond(422, {
      message: "Formula rate tidak valid",
      errors: {
        specificBonus: "Bonus Specific harus antara Rp0 dan Rp10.000.000",
        latePenaltyPerDay: "Penalti harus angka bulat",
      },
    });

    await expect(saveRateFormula(request)).resolves.toEqual({
      ok: false,
      message: "Formula rate tidak valid",
      errors: {
        specificBonus: "Bonus Specific harus antara Rp0 dan Rp10.000.000",
        latePenaltyPerDay: "Penalti harus angka bulat",
      },
    });
  });

  it("files a platform's tier and metric messages under that platform", async () => {
    respond(422, {
      errors: {
        "performanceBonus.instagram.tiers": "Bonus harus naik seiring minimum.",
        "performanceBonus.tiktok.metric": "Metrik wajib dipilih",
      },
    });

    await expect(saveRateFormula(request)).resolves.toMatchObject({
      ok: false,
      errors: {
        "performanceBonus.instagram": "Bonus harus naik seiring minimum.",
        "performanceBonus.tiktok": "Metrik wajib dipilih",
      },
    });
  });

  it("keeps only string messages for fields the form knows", async () => {
    respond(422, { errors: { specificBonus: "Terlalu besar", is_admin: "x", latePenaltyPerDay: 3 } });

    await expect(saveRateFormula(request)).resolves.toEqual({
      ok: false,
      message: "Formula rate tidak valid",
      errors: { specificBonus: "Terlalu besar" },
    });
  });

  it("answers with no field messages when a 422 has no readable body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json", { status: 422 }));

    await expect(saveRateFormula(request)).resolves.toEqual({
      ok: false,
      message: "Formula rate tidak valid",
      errors: {},
    });
  });

  it.each([400, 403, 500, 502])("answers one retryable message for HTTP %s", async (status) => {
    respond(status);

    await expect(saveRateFormula(request)).resolves.toEqual({
      ok: false,
      message: "Formula rate gagal disimpan. Coba lagi.",
      errors: {},
    });
  });

  it("answers the same retryable message when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));

    await expect(saveRateFormula(request)).resolves.toEqual({
      ok: false,
      message: "Formula rate gagal disimpan. Coba lagi.",
      errors: {},
    });
  });
});
