import { DraftReviewActionError } from "./draft-review-actions";
import { approveProposal, rejectProposal } from "./proposal-actions";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("approveProposal", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PATCHes the proposal's approve endpoint without a body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: UUID, status: "scheduled" })),
    );

    await expect(approveProposal(UUID)).resolves.toBeUndefined();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/contents/${UUID}/proposal/approve`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(vi.mocked(globalThis.fetch).mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("encodes a crafted id so it cannot climb out of the contents path", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("", { status: 200 }));

    await approveProposal("../../creators");

    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      "/api/contents/..%2F..%2Fcreators/proposal/approve",
    );
  });

  it("rejects with the backend's reason and status when the proposal was already decided", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "PROPOSAL_NOT_PENDING",
          message: "Pengajuan ini sudah tidak menunggu keputusan",
        }),
        { status: 409 },
      ),
    );

    const error = await approveProposal(UUID).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DraftReviewActionError);
    expect(error).toMatchObject({
      status: 409,
      message: "Pengajuan ini sudah tidak menunggu keputusan",
    });
  });

  it("never shows a 5xx body, only its own wording", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "PrismaClientKnownRequestError at ..." }), {
        status: 500,
      }),
    );

    await expect(approveProposal(UUID)).rejects.toMatchObject({
      status: 500,
      message: "Pengajuan gagal disetujui. Coba lagi.",
    });
  });
});

describe("rejectProposal", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the reason as JSON to the proposal's reject endpoint", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: UUID, removed: true })),
    );

    await expect(rejectProposal(UUID, "Kurang relevan.")).resolves.toBeUndefined();

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe(`/api/contents/${UUID}/proposal/reject`);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Kurang relevan." }),
    });
  });

  it("sends no reason at all when the admin wrote none", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}"));

    await rejectProposal(UUID, "");

    expect(vi.mocked(globalThis.fetch).mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ reason: null }),
    });
  });

  it("shows the field error the backend gave for the reason", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Data penolakan tidak valid",
          errors: { reason: "Alasan maksimal 1000 karakter" },
        }),
        { status: 422 },
      ),
    );

    await expect(rejectProposal(UUID, "x")).rejects.toMatchObject({
      status: 422,
      message: "Alasan maksimal 1000 karakter",
    });
  });

  it("falls back to its own wording when a 4xx says nothing readable", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("not json", { status: 404 }));

    await expect(rejectProposal(UUID, "")).rejects.toMatchObject({
      status: 404,
      message: "Pengajuan gagal ditolak. Coba lagi.",
    });
  });
});
