import { endContractEarly, previewEarlyEnd } from "./early-end-api";
import type { EarlyEndRequest } from "./early-end";

const CREATOR = "11111111-1111-4111-8111-111111111111";
const CONTRACT = "22222222-2222-4222-8222-222222222222";
const BASE = `/api/creators/${CREATOR}/contracts/${CONTRACT}/early-end`;

const REQUEST: EarlyEndRequest = {
  invoice: "pay",
  lastDay: "2026-11-30",
  reason: "violation",
  note: "Konten diunggah ulang dari creator lain.",
  upcomingPeriods: "delete",
};

const PLAN = {
  lastDay: "2026-11-30",
  originalEndDate: "2026-12-15",
  invoice: "pay",
  reasonMismatch: true,
  finalizableFrom: "2026-12-01",
  closing: [{ id: "c-1", name: "Evg_3", deadline: "2026-12-08" }],
  unfinished: [{ id: "c-2", name: "Evg_2", deadline: "2026-11-30" }],
  upcomingPeriods: "delete",
  deletedPeriods: [{ contractId: "p-3", periodNumber: 2, startDate: "2026-12-16", endDate: "2027-03-15" }],
  keptPeriods: [],
  access: "after_invoice_paid",
};

const FAILED = "Kontrak gagal diakhiri. Coba lagi.";

afterEach(() => {
  vi.restoreAllMocks();
});

function respond(status: number, body?: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

describe.each([
  ["previewEarlyEnd", previewEarlyEnd, `${BASE}/preview`],
  ["endContractEarly", endContractEarly, BASE],
] as const)("%s", (_name, call, path) => {
  it("posts the form through the same-origin proxy and answers the plan", async () => {
    const fetchSpy = respond(200, PLAN);

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({ ok: true, plan: PLAN });
    expect(fetchSpy).toHaveBeenCalledWith(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });
  });

  // OWASP A04:2025 (mass assignment): only the form's own fields leave the browser.
  it("sends only the form's fields, whatever else the caller's object carries", async () => {
    const fetchSpy = respond(200, PLAN);
    const padded = { ...REQUEST, endedBy: "someone", originalEndDate: "2030-01-01" };

    await call(CREATOR, CONTRACT, padded as EarlyEndRequest);

    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["invoice", "lastDay", "note", "reason", "upcomingPeriods"]);
  });

  it("leaves upcomingPeriods out when the form has no such choice", async () => {
    const fetchSpy = respond(200, PLAN);
    const { upcomingPeriods: _, ...withoutChoice } = REQUEST;

    await call(CREATOR, CONTRACT, withoutChoice);

    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).not.toHaveProperty("upcomingPeriods");
  });

  it("hands back the server's message under each field it refused, and nothing else", async () => {
    respond(422, {
      message: "Data pengakhiran kontrak tidak valid",
      errors: { lastDay: "Pilih antara 24 Nov 2026 dan 14 Des 2026", note: 42, other: "x" },
    });

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Data pengakhiran kontrak tidak valid",
      errors: { lastDay: "Pilih antara 24 Nov 2026 dan 14 Des 2026" },
    });
  });

  it("answers a 422 without a body in the same words", async () => {
    respond(422);

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Data pengakhiran kontrak tidak valid",
      errors: {},
    });
  });

  // AC 6: another Admin ended it first.
  it("tells the admin the contract was already ended", async () => {
    respond(409, { code: "CONTRACT_ALREADY_ENDED", message: "Kontrak sudah diakhiri" });

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Kontrak sudah diakhiri. Muat ulang untuk melihat status terbaru.",
      errors: {},
    });
  });

  it.each([
    [409, { code: "CONTRACT_ENDED" }],
    [409, null],
  ])("asks for a reload on any other conflict (%s %j)", async (status, body) => {
    respond(status, body);

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({
      ok: false,
      message: "Kontrak tidak bisa diakhiri saat ini. Muat ulang untuk melihat status terbaru.",
      errors: {},
    });
  });

  it.each([500, 404, 403])("says it failed on %s", async (status) => {
    respond(status, { message: "boom" });

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
  });

  it("says it failed when the network does", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
  });

  // OWASP A01:2025: a malformed id never builds a path to another route.
  it.each([
    ["creator", "../internal", CONTRACT],
    ["contract", CREATOR, "x/../../auth"],
  ])("sends nothing for a malformed %s id", async (_label, creatorId, contractId) => {
    const fetchSpy = respond(200, PLAN);

    await expect(call(creatorId, contractId, REQUEST)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // OWASP A08:2025: only a plan of the expected shape reaches the confirmation, text kept as text.
  it.each([
    ["no body", undefined],
    ["an unknown access", { ...PLAN, access: "<script>" }],
    ["a missing day", { ...PLAN, lastDay: 5 }],
    ["an unknown invoice choice", { ...PLAN, invoice: "refund" }],
  ])("says it failed on a plan with %s", async (_label, body) => {
    respond(200, body);

    await expect(call(CREATOR, CONTRACT, REQUEST)).resolves.toEqual({ ok: false, message: FAILED, errors: {} });
  });

  it("keeps only text names and whole period numbers from the lists", async () => {
    respond(200, {
      ...PLAN,
      finalizableFrom: null,
      closing: [{ id: "c-1", name: "Evg_3", deadline: "2026-12-08", extra: "x" }, { name: 3 }, null],
      unfinished: "none",
      deletedPeriods: [{ contractId: "p-3", periodNumber: "2", startDate: "a", endDate: "b" }],
      keptPeriods: [{ contractId: "p-4", periodNumber: 3, startDate: "2027-04-01", endDate: "2027-06-30" }],
    });

    const result = await call(CREATOR, CONTRACT, REQUEST);

    expect(result).toMatchObject({
      ok: true,
      plan: {
        finalizableFrom: null,
        closing: [{ id: "c-1", name: "Evg_3", deadline: "2026-12-08" }],
        unfinished: [],
        deletedPeriods: [],
        keptPeriods: [{ contractId: "p-4", periodNumber: 3, startDate: "2027-04-01", endDate: "2027-06-30" }],
      },
    });
  });
});
