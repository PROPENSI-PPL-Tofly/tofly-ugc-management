import { createContract, deleteContract, updateContract, type ContractRequest } from "./contracts";

const CREATOR = "11111111-1111-4111-8111-111111111111";
const CONTRACT = "22222222-2222-4222-8222-222222222222";

const REQUEST: ContractRequest = {
  contractStart: "2027-01-01",
  contractEnd: "2027-03-31",
  interval: 14,
  quota: 2,
  fixedRate: 3_000_000,
  contractType: "regular",
  deadlines: ["2027-01-06", "2027-01-20"],
};

const SAVE_FAILED = "Periode gagal disimpan. Coba lagi.";
const DELETE_FAILED = "Periode gagal dihapus. Coba lagi.";

afterEach(() => {
  vi.restoreAllMocks();
});

function respond(status: number, body?: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

describe("createContract", () => {
  it("posts the new period to the creator's contracts through the same-origin proxy (30.1)", async () => {
    const fetchSpy = respond(201, { id: CONTRACT });

    await expect(createContract(CREATOR, REQUEST)).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(`/api/creators/${CREATOR}/contracts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });
  });

  // OWASP A04 (mass assignment): only the period's own terms leave the browser, whatever the
  // caller's object also holds, so no form can ask the API for a status or another creator.
  it("sends only the period's terms, never anything else the caller's object carries", async () => {
    const fetchSpy = respond(201);
    const padded = { ...REQUEST, creatorId: "someone-else", status: "active", invoiceStatus: "paid" };

    await createContract(CREATOR, padded as ContractRequest);

    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(
      ["contractEnd", "contractStart", "contractType", "deadlines", "fixedRate", "interval", "quota"],
    );
  });

  it("hands back the server's message under each field it refused", async () => {
    respond(422, {
      errors: { contractStart: "Tanggal mulai harus setelah akhir kontrak sebelumnya", deadlines: "Deadline di luar periode" },
    });

    await expect(createContract(CREATOR, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Data periode tidak valid",
      errors: {
        contractStart: "Tanggal mulai harus setelah akhir kontrak sebelumnya",
        deadlines: "Deadline di luar periode",
      },
    });
  });

  // OWASP A05: a field the form has no place for, or a message that is not text, never reaches it.
  it("keeps only text messages for the period's own fields", async () => {
    respond(422, { errors: { quota: "Jumlah konten maksimal 100", email: "x", role: "admin", interval: 3 } });

    await expect(createContract(CREATOR, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Data periode tidak valid",
      errors: { quota: "Jumlah konten maksimal 100" },
    });
  });

  it("reads a 422 without a readable body as invalid data with nothing per field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>", { status: 422 }));

    await expect(createContract(CREATOR, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Data periode tidak valid",
      errors: {},
    });
  });

  // Another admin added or changed a period meanwhile: the page the admin sees is stale.
  it("says the period clashes when the server answers 409", async () => {
    respond(409, { message: "Contract periods overlap" });

    await expect(createContract(CREATOR, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Periode bertabrakan dengan periode lain atau sudah dimulai. Muat ulang halaman lalu coba lagi.",
      errors: {},
    });
  });

  // OWASP A05: the server's own wording (a stack, an SQL error) is never shown.
  it.each([
    ["a server error", 500],
    ["a creator that is gone", 404],
    ["a refused role", 403],
  ])("offers one retryable message for %s, never the server's text", async (_label, status) => {
    respond(status, { message: "relation \"contracts\" does not exist" });

    await expect(createContract(CREATOR, REQUEST)).resolves.toEqual({ ok: false, message: SAVE_FAILED, errors: {} });
  });

  it("offers the same message when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(createContract(CREATOR, REQUEST)).resolves.toEqual({ ok: false, message: SAVE_FAILED, errors: {} });
  });

  // OWASP A01: an id that is not a UUID never becomes part of a backend path ("../auth").
  it.each([["a path walk", "../auth"], ["an empty id", ""], ["a query", `${CREATOR}?role=admin`]])(
    "refuses %s as the creator without calling the API",
    async (_label, creatorId) => {
      const fetchSpy = respond(201);

      await expect(createContract(creatorId, REQUEST)).resolves.toEqual({ ok: false, message: SAVE_FAILED, errors: {} });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("updateContract", () => {
  it("puts the changed terms on the period that has not started (AC 8)", async () => {
    const fetchSpy = respond(200, { id: CONTRACT });

    await expect(updateContract(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(`/api/creators/${CREATOR}/contracts/${CONTRACT}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });
  });

  it("says the period clashes or has started when the server answers 409", async () => {
    respond(409);

    await expect(updateContract(CREATOR, CONTRACT, REQUEST)).resolves.toMatchObject({
      ok: false,
      message: "Periode bertabrakan dengan periode lain atau sudah dimulai. Muat ulang halaman lalu coba lagi.",
    });
  });

  // The user's decision on 30.1: an edit that would leave Specific content outside the period is
  // refused with errors.contents; the admin is told which content to move first.
  it("says which Specific content an edit would strand, from errors.contents", async () => {
    const reason =
      'Konten "Tofly x komunitas lari" (deadline 1 Agu 2027) di luar periode baru (15 Mei 2027 – 30 Jun 2027); pindahkan atau hapus dulu';
    respond(422, { message: "Data periode tidak valid", errors: { contents: reason } });

    await expect(updateContract(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({
      ok: false,
      message: reason,
      errors: {},
    });
  });

  // OWASP A05: only a short line of text stands in for the generic message.
  it.each([
    ["not text", { contents: 42 }],
    ["too long to be a reason", { contents: "x".repeat(301) }],
  ])("keeps the generic message when errors.contents is %s", async (_label, errors) => {
    respond(422, { errors });

    await expect(updateContract(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Data periode tidak valid",
      errors: {},
    });
  });

  it("refuses a contract id that is not a UUID without calling the API", async () => {
    const fetchSpy = respond(200);

    await expect(updateContract(CREATOR, "../../invoices", REQUEST)).resolves.toEqual({
      ok: false,
      message: SAVE_FAILED,
      errors: {},
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("deleteContract", () => {
  it("deletes the period that has not started (AC 9)", async () => {
    const fetchSpy = respond(204);

    await expect(deleteContract(CREATOR, CONTRACT)).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(`/api/creators/${CREATOR}/contracts/${CONTRACT}`, { method: "DELETE" });
  });

  it("says a period that started meanwhile can no longer be deleted (AC 10)", async () => {
    respond(409);

    await expect(deleteContract(CREATOR, CONTRACT)).resolves.toEqual({
      ok: false,
      message: "Periode sudah dimulai dan tidak bisa dihapus. Muat ulang halaman.",
    });
  });

  // The user's decision on 30.1: a creator's only period is never deleted (409 LAST_PERIOD).
  it("says the creator's only period cannot be deleted when the server answers LAST_PERIOD", async () => {
    respond(409, { code: "LAST_PERIOD", message: "whatever the server says" });

    await expect(deleteContract(CREATOR, CONTRACT)).resolves.toEqual({
      ok: false,
      message: "Ini satu-satunya periode creator, jadi tidak bisa dihapus.",
    });
  });

  it.each([
    ["a server error", () => respond(500)],
    ["a network failure", () => vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"))],
  ])("offers one retryable message for %s", async (_label, arrange) => {
    arrange();

    await expect(deleteContract(CREATOR, CONTRACT)).resolves.toEqual({ ok: false, message: DELETE_FAILED });
  });

  it.each([
    ["creator", "not-a-uuid", CONTRACT],
    ["contract", CREATOR, "not-a-uuid"],
  ])("refuses a %s id that is not a UUID without calling the API", async (_label, creatorId, contractId) => {
    const fetchSpy = respond(204);

    await expect(deleteContract(creatorId, contractId)).resolves.toEqual({ ok: false, message: DELETE_FAILED });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
