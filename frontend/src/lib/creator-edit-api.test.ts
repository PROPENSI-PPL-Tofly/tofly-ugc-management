import { saveCreatorEdit } from "./creator-edit-api";

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAILED = { ok: false, message: "Perubahan gagal disimpan. Coba lagi.", errors: {} };
const STALE = {
  ok: false,
  message: "Data creator sudah berubah. Muat ulang halaman lalu coba lagi.",
  errors: {},
};

const apiFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();
vi.mock("./api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function answer(status: number, body: unknown = {}) {
  apiFetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("saveCreatorEdit", () => {
  beforeEach(() => apiFetch.mockReset());

  it("patches the creator with just the changed fields", async () => {
    answer(200, { id: CREATOR, changed: ["name"] });

    await expect(saveCreatorEdit(CREATOR, { name: "Rani" })).resolves.toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(`/api/creators/${CREATOR}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rani" }),
    });
  });

  it("gives back the server's message under each field the form has", async () => {
    answer(422, {
      errors: {
        email: "Email sudah terdaftar",
        contractType: "Jenis kontrak wajib dipilih",
        contractId: "Periode tidak valid",
        quota: 7,
      },
    });

    await expect(saveCreatorEdit(CREATOR, { email: "x@y.co" })).resolves.toEqual({
      ok: false,
      message: "Data creator tidak valid",
      errors: { email: "Email sudah terdaftar", contractType: "Jenis kontrak wajib dipilih" },
    });
  });

  it("reads a 422 that is not JSON as one message", async () => {
    apiFetch.mockResolvedValue(new Response("<html>", { status: 422 }));
    await expect(saveCreatorEdit(CREATOR, { name: "x" })).resolves.toEqual({
      ok: false,
      message: "Data creator tidak valid",
      errors: {},
    });
  });

  // A lock closed or the period went while the form was open.
  it.each([404, 409])("asks for a reload on %d", async (status) => {
    answer(status);
    await expect(saveCreatorEdit(CREATOR, { name: "x" })).resolves.toEqual(STALE);
  });

  it("offers a retry on any other failure, the network included", async () => {
    answer(500);
    await expect(saveCreatorEdit(CREATOR, { name: "x" })).resolves.toEqual(FAILED);
    apiFetch.mockRejectedValue(new Error("offline"));
    await expect(saveCreatorEdit(CREATOR, { name: "x" })).resolves.toEqual(FAILED);
  });

  // OWASP A05: an id from the address never steps out of its path segment.
  it("sends nothing for an id that is not a UUID", async () => {
    await expect(saveCreatorEdit("../invoices", { name: "x" })).resolves.toEqual(FAILED);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
