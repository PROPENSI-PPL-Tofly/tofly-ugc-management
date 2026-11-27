import { cancelProposal } from "./cancel-proposal";

const CONTENT = "33333333-3333-4333-8333-333333333333";
const FAILED = "Pengajuan gagal dibatalkan. Coba lagi.";

afterEach(() => {
  vi.restoreAllMocks();
});

function respond(status: number, body?: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

// PBI-14 (14.3): "Batalkan Pengajuan" asks 14.1's DELETE /me/contents/proposals/:id, through the
// same-origin proxy. The contract is assumed until 14.1 is merged.
describe("cancelProposal", () => {
  it("deletes the creator's pending proposal through the same-origin proxy", async () => {
    const fetchSpy = respond(204);

    await expect(cancelProposal(CONTENT)).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`/api/me/contents/proposals/${CONTENT}`, {
      method: "DELETE",
    });
  });

  it("takes a 200 as done too", async () => {
    respond(200, {});

    await expect(cancelProposal(CONTENT)).resolves.toEqual({ ok: true });
  });

  // The admin decided first: the list on screen is stale, so it is read again.
  it("says the admin already decided when the proposal is no longer pending (409)", async () => {
    respond(409, { code: "PROPOSAL_NOT_PENDING", message: "anything the server says" });

    await expect(cancelProposal(CONTENT)).resolves.toEqual({
      ok: false,
      stale: true,
      message: "Pengajuan sudah diputuskan Admin. Muat ulang untuk melihat status terbaru.",
    });
  });

  // OWASP A01:2025: another creator's proposal reads as missing, and so does one already gone.
  it("says it is gone when the proposal cannot be found (404)", async () => {
    respond(404);

    await expect(cancelProposal(CONTENT)).resolves.toEqual({
      ok: false,
      stale: true,
      message: "Pengajuan tidak ditemukan. Muat ulang untuk melihat status terbaru.",
    });
  });

  it.each([500, 403, 422])("asks to try again on %s, never echoing the server's text", async (status) => {
    respond(status, { message: "<b>internal</b>" });

    await expect(cancelProposal(CONTENT)).resolves.toEqual({ ok: false, stale: false, message: FAILED });
  });

  it("asks to try again when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    await expect(cancelProposal(CONTENT)).resolves.toEqual({ ok: false, stale: false, message: FAILED });
  });

  // OWASP A01:2025: an id that is not a UUID never builds a path to another route.
  it.each(["../me/invoices", "", "x/../../auth"])("sends nothing for the id %j", async (id) => {
    const fetchSpy = respond(204);

    await expect(cancelProposal(id)).resolves.toEqual({ ok: false, stale: false, message: FAILED });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
