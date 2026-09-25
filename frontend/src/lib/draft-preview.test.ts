import {
  DraftPreviewError,
  fetchDraftPreview,
  toDraftPreview,
  type RawDraftPreview,
} from "./draft-preview";

// The shape GET /api/submissions/:id is assumed to answer with until SCRUM-123 settles it.
// Every test below goes through this one fixture, so a contract change is a change here
// and in toDraftPreview, not across the modal's tests.
function rawPreview(overrides: Partial<RawDraftPreview> = {}): RawDraftPreview {
  return {
    submissionId: "sub-2",
    contentName: "Promo Lebaran",
    creatorName: "Rangga Pratama",
    type: "specific",
    brief: "Tunjukkan fitur cashback.",
    deadline: "2026-10-05",
    status: "draft_review",
    draftLink: "https://drive.google.com/file/d/draft-2",
    revisions: [
      {
        submissionId: "sub-1",
        link: "https://drive.google.com/file/d/draft-1",
        note: "Audio terlalu pelan.",
        submittedAt: "2026-09-20T03:00:00.000Z",
      },
      {
        submissionId: "sub-2",
        link: "https://drive.google.com/file/d/draft-2",
        note: null,
        submittedAt: "2026-09-23T03:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("toDraftPreview", () => {
  it("carries the content, creator, and current draft over as they are", () => {
    const preview = toDraftPreview(rawPreview());

    expect(preview).toMatchObject({
      submissionId: "sub-2",
      contentName: "Promo Lebaran",
      creatorName: "Rangga Pratama",
      type: "specific",
      brief: "Tunjukkan fitur cashback.",
      deadline: "2026-10-05",
      status: "draft_review",
      draftLink: "https://drive.google.com/file/d/draft-2",
    });
  });

  it("marks only the draft being previewed as the current one", () => {
    const { revisions } = toDraftPreview(rawPreview());

    expect(revisions.map((revision) => revision.isCurrent)).toEqual([false, true]);
  });

  it("orders the history oldest first even when the API does not", () => {
    const raw = rawPreview();
    const { revisions } = toDraftPreview({ ...raw, revisions: [...raw.revisions].reverse() });

    expect(revisions.map((revision) => revision.submissionId)).toEqual(["sub-1", "sub-2"]);
  });

  it("does not reorder the history it was given", () => {
    const raw = rawPreview();
    const reversed = [...raw.revisions].reverse();

    toDraftPreview({ ...raw, revisions: reversed });

    expect(reversed.map((revision) => revision.submissionId)).toEqual(["sub-2", "sub-1"]);
  });

  it.each([
    ["an empty", ""],
    ["a whitespace-only", "  \n\t "],
  ])("treats %s revision note as no note", (_label, note) => {
    const raw = rawPreview();
    const { revisions } = toDraftPreview({
      ...raw,
      revisions: [{ ...raw.revisions[0], note }],
    });

    expect(revisions[0].note).toBeNull();
  });

  it("keeps a note's own line breaks", () => {
    const raw = rawPreview();
    const note = "Audio terlalu pelan.\nTambahkan subtitle.";
    const { revisions } = toDraftPreview({
      ...raw,
      revisions: [{ ...raw.revisions[0], note }],
    });

    expect(revisions[0].note).toBe(note);
  });

  it("reads a missing brief as an empty one", () => {
    const preview = toDraftPreview(rawPreview({ type: "evergreen", brief: null }));

    expect(preview.brief).toBe("");
  });

  it("accepts a draft with no history yet", () => {
    const preview = toDraftPreview(rawPreview({ revisions: [] }));

    expect(preview.revisions).toEqual([]);
  });
});

describe("fetchDraftPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function respond(status: number, body: unknown) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }

  it("asks this app's API proxy for the submission without caching", async () => {
    const fetchSpy = respond(200, rawPreview());

    await fetchDraftPreview("sub-2");

    expect(fetchSpy).toHaveBeenCalledWith("/api/submissions/sub-2", { cache: "no-store" });
  });

  it("answers with the preview the adapter builds", async () => {
    respond(200, rawPreview());

    await expect(fetchDraftPreview("sub-2")).resolves.toEqual(toDraftPreview(rawPreview()));
  });

  it("encodes the id so it cannot reach another API path", async () => {
    const fetchSpy = respond(200, rawPreview());

    await fetchDraftPreview("../creators/x?y=1");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "/api/submissions/..%2Fcreators%2Fx%3Fy%3D1",
    );
  });

  it.each([404, 500, 503])("turns HTTP %i into an error carrying that status", async (status) => {
    respond(status, { message: "nope" });

    const failure = fetchDraftPreview("sub-2");

    await expect(failure).rejects.toBeInstanceOf(DraftPreviewError);
    await expect(failure).rejects.toMatchObject({ status });
  });

  it("lets a network failure through as a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchDraftPreview("sub-2")).rejects.toThrow("Failed to fetch");
  });
});
