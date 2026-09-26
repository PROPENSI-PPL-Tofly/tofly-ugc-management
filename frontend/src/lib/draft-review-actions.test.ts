import {
  DraftReviewActionError,
  approveSubmission,
  reviseSubmission,
} from "./draft-review-actions";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("approveSubmission", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PATCHes the approve endpoint without a body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: UUID, contentId: "c1", status: "draft_approved" })),
    );

    await approveSubmission(UUID);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/submissions/${UUID}/approve`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("encodes a crafted id so it cannot climb out of the submissions path", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("", { status: 200 }));

    await approveSubmission("../../admin/users");

    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toBe("/api/submissions/..%2F..%2Fadmin%2Fusers/approve");
  });

  it("resolves when the backend answers 2xx", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(approveSubmission(UUID)).resolves.toBeUndefined();
  });

  it("rejects with the backend message on a conflict", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: "DRAFT_NOT_REVIEWABLE", message: "Draft ini sudah tidak menunggu keputusan" }),
        { status: 409 },
      ),
    );

    const error = await approveSubmission(UUID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DraftReviewActionError);
    expect(error).toMatchObject({
      status: 409,
      message: "Draft ini sudah tidak menunggu keputusan",
    });
  });

  it("shows its own message for a server failure instead of the server's wording", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 500, message: "Internal server error" }), {
        status: 500,
      }),
    );

    const error = await approveSubmission(UUID).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 500, message: "Keputusan gagal dikirim. Coba lagi." });
  });

  it("falls back to a generic message when the failure body says nothing useful", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("", { status: 500 }));

    const error = await approveSubmission(UUID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DraftReviewActionError);
    expect(error).toMatchObject({ status: 500 });
    expect((error as DraftReviewActionError).message).toBe(
      "Keputusan gagal dikirim. Coba lagi.",
    );
  });

  it("ignores a failure body that is not JSON", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("<html>not found</html>", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const error = await approveSubmission(UUID).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 404 });
    expect((error as DraftReviewActionError).message).toBe(
      "Keputusan gagal dikirim. Coba lagi.",
    );
  });

  it("ignores a JSON failure body that carries no message at all", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 500 }), { status: 500 }),
    );

    const error = await approveSubmission(UUID).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 500 });
    expect((error as DraftReviewActionError).message).toBe(
      "Keputusan gagal dikirim. Coba lagi.",
    );
  });
});

describe("reviseSubmission", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PATCHes the revise endpoint with the note as JSON", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: UUID, status: "draft_revision" })),
    );

    await reviseSubmission(UUID, "Audio terlalu pelan.");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/submissions/${UUID}/revise`,
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionNotes: "Audio terlalu pelan." }),
      }),
    );
  });

  it("resolves when the backend answers 2xx", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(reviseSubmission(UUID, "note")).resolves.toBeUndefined();
  });

  it("rejects with the backend message when the note is rejected", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Data revisi tidak valid",
          errors: { revisionNotes: "Catatan revisi tidak boleh kosong" },
        }),
        { status: 422 },
      ),
    );

    const error = await reviseSubmission(UUID, "   ").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DraftReviewActionError);
    expect(error).toMatchObject({ status: 422 });
    expect((error as DraftReviewActionError).message).toBe(
      "Catatan revisi tidak boleh kosong",
    );
  });

  it("falls back to a generic message when the failure body says nothing useful", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("", { status: 502 }));

    const error = await reviseSubmission(UUID, "note").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DraftReviewActionError);
    expect((error as DraftReviewActionError).message).toBe(
      "Permintaan revisi gagal dikirim. Coba lagi.",
    );
  });

  it("does not pass a gateway's error text through to the admin", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "upstream connect error: 10.0.3.7:3001" }), {
        status: 502,
      }),
    );

    const error = await reviseSubmission(UUID, "note").catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 502,
      message: "Permintaan revisi gagal dikirim. Coba lagi.",
    });
  });
});
