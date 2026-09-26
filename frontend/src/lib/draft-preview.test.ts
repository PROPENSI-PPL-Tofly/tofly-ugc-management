import {
  DraftPreviewError,
  fetchDraftPreview,
  toDraftPreview,
  type RawDraftPreview,
} from "./draft-preview";

// GET /api/submissions/:id as SCRUM-123 (#36) answers it, plus the four fields asked of it
// for the modal header (contentName, creatorName, deadline, type). Every test goes through
// this one fixture, so a contract change is a change here and in toDraftPreview only.
function rawPreview(overrides: Partial<RawDraftPreview> = {}): RawDraftPreview {
  return {
    brief: "Tunjukkan fitur cashback.",
    link: "https://drive.google.com/file/d/draft-2",
    status: "draft_revised",
    revisionHistory: [
      { note: "Audio terlalu pelan.", date: "2026-09-20T03:00:00.000Z" },
      { note: "Tambahkan subtitle.", date: "2026-09-22T03:00:00.000Z" },
    ],
    contentName: "Promo Lebaran",
    creatorName: "Rangga Pratama",
    deadline: "2026-10-05",
    type: "specific",
    ...overrides,
  };
}

describe("toDraftPreview", () => {
  it("carries the draft over under the modal's names", () => {
    expect(toDraftPreview(rawPreview(), "sub-2")).toMatchObject({
      submissionId: "sub-2",
      contentName: "Promo Lebaran",
      creatorName: "Rangga Pratama",
      type: "specific",
      brief: "Tunjukkan fitur cashback.",
      deadline: "2026-10-05",
      status: "draft_revised",
      draftLink: "https://drive.google.com/file/d/draft-2",
    });
  });

  it("keeps each revision note with the moment it was written", () => {
    const { revisions } = toDraftPreview(rawPreview(), "sub-2");

    expect(revisions).toEqual([
      { note: "Audio terlalu pelan.", date: "2026-09-20T03:00:00.000Z" },
      { note: "Tambahkan subtitle.", date: "2026-09-22T03:00:00.000Z" },
    ]);
  });

  it("orders the history oldest first even when the API does not", () => {
    const raw = rawPreview();
    const { revisions } = toDraftPreview(
      { ...raw, revisionHistory: [...raw.revisionHistory].reverse() },
      "sub-2",
    );

    expect(revisions.map((revision) => revision.note)).toEqual([
      "Audio terlalu pelan.",
      "Tambahkan subtitle.",
    ]);
  });

  it("does not reorder the history it was given", () => {
    const raw = rawPreview();
    const reversed = [...raw.revisionHistory].reverse();

    toDraftPreview({ ...raw, revisionHistory: reversed }, "sub-2");

    expect(reversed.map((revision) => revision.note)).toEqual([
      "Tambahkan subtitle.",
      "Audio terlalu pelan.",
    ]);
  });

  it.each([
    ["an empty", ""],
    ["a whitespace-only", "  \n\t "],
    ["a missing", null],
  ])("leaves out an entry with %s note, since the history is of notes", (_label, note) => {
    const raw = rawPreview();
    const { revisions } = toDraftPreview(
      { ...raw, revisionHistory: [{ note, date: "2026-09-19T03:00:00.000Z" }, ...raw.revisionHistory] },
      "sub-2",
    );

    expect(revisions).toHaveLength(2);
  });

  it("keeps a note's own line breaks", () => {
    const note = "Audio terlalu pelan.\nTambahkan subtitle.";
    const { revisions } = toDraftPreview(
      rawPreview({ revisionHistory: [{ note, date: "2026-09-20T03:00:00.000Z" }] }),
      "sub-2",
    );

    expect(revisions[0].note).toBe(note);
  });

  it("reads a missing brief as an empty one", () => {
    expect(toDraftPreview(rawPreview({ brief: null }), "sub-2").brief).toBe("");
  });

  it("accepts a draft with no history yet", () => {
    expect(toDraftPreview(rawPreview({ revisionHistory: [] }), "sub-2").revisions).toEqual([]);
  });

  // #36 does not send these yet; the modal must still open, with dashes where they go.
  it("reads the header fields the API does not send yet as unknown", () => {
    const asMergedIn36: RawDraftPreview = {
      brief: "Tunjukkan fitur cashback.",
      link: "https://drive.google.com/file/d/draft-2",
      status: "draft_revised",
      revisionHistory: [],
    };

    expect(toDraftPreview(asMergedIn36, "sub-2")).toMatchObject({
      contentName: null,
      creatorName: null,
      deadline: null,
      type: null,
    });
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

  it("answers with the preview the adapter builds for that submission", async () => {
    respond(200, rawPreview());

    await expect(fetchDraftPreview("sub-2")).resolves.toEqual(
      toDraftPreview(rawPreview(), "sub-2"),
    );
  });

  it("encodes the id so it cannot reach another API path", async () => {
    const fetchSpy = respond(200, rawPreview());

    await fetchDraftPreview("../creators/x?y=1");

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/submissions/..%2Fcreators%2Fx%3Fy%3D1");
  });

  it.each([400, 404, 500, 503])("turns HTTP %i into an error carrying that status", async (status) => {
    respond(status, { code: "SUBMISSION_NOT_FOUND", message: "Draft tidak ditemukan" });

    const failure = fetchDraftPreview("sub-2");

    await expect(failure).rejects.toBeInstanceOf(DraftPreviewError);
    await expect(failure).rejects.toMatchObject({ status });
  });

  it("lets a network failure through as a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchDraftPreview("sub-2")).rejects.toThrow("Failed to fetch");
  });
});
