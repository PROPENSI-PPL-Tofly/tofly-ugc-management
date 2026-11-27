import { submitProposal } from "./creator-proposal-api";

const FAILED = "Pengajuan gagal dikirim. Coba lagi.";
const NOT_ACTIVE = "Pengajuan hanya bisa dikirim selama kontrakmu aktif.";

const FIELDS = {
  name: "  Review Sunscreen Gel  ",
  brief: " Pakai gel di pantai. ",
  deadline: "2026-12-01",
  notes: "   ",
};

afterEach(() => {
  vi.restoreAllMocks();
});

function respond(status: number, body?: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

// PBI-14 (14.2): the form sends 14.1's POST /me/contents/proposals through the same-origin proxy.
// The contract is assumed here until 14.1 is merged, and written in the PR for 14.1 to answer.
describe("submitProposal", () => {
  it("posts the trimmed proposal through the same-origin proxy", async () => {
    const fetchSpy = respond(201, { id: "c1" });

    await expect(submitProposal(FIELDS)).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith("/api/me/contents/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Review Sunscreen Gel",
        brief: "Pakai gel di pantai.",
        deadline: "2026-12-01",
        notes: null,
      }),
    });
  });

  // AC 1 and AC 2: what the API refuses lands under its own field.
  it("puts a 422's messages under their fields, and keeps only the form's fields", async () => {
    respond(422, {
      message: "Data tidak valid",
      errors: { deadline: "Pilih antara 21 Nov 2026 dan 26 Des 2026", contractId: "x", name: 42 },
    });

    await expect(submitProposal(FIELDS)).resolves.toEqual({
      ok: false,
      message: "",
      errors: { deadline: "Pilih antara 21 Nov 2026 dan 26 Des 2026" },
    });
  });

  it("asks to try again for a 422 without a field the form shows", async () => {
    respond(422, { message: "Data tidak valid" });

    await expect(submitProposal(FIELDS)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
  });

  // AC 3 (OWASP A01): the API is the last word on who may propose; its own words never show.
  it("says the contract is not active for a 403", async () => {
    respond(403, { message: "Forbidden resource" });

    await expect(submitProposal(FIELDS)).resolves.toEqual({ ok: false, message: NOT_ACTIVE, errors: {} });
  });

  it.each([400, 409, 500, 502])("asks to try again for a %i", async (status) => {
    respond(status, { message: "internal detail" });

    await expect(submitProposal(FIELDS)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
  });

  it("asks to try again when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(submitProposal(FIELDS)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
  });

  it("asks to try again for a 422 whose body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json", { status: 422 }));

    await expect(submitProposal(FIELDS)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
  });
});
