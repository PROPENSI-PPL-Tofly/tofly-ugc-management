import {
  ContentDetailError,
  fetchContentDetail,
  toContentDetail,
  type RawContentDetail,
  type RawTimelineEvent,
} from "./content-detail";

// GET /api/contents/:id/timeline as this panel assumes subtask 6.3 will answer it: the
// content's header fields plus every event. Every test goes through this one fixture, so a
// contract change is a change here and in toContentDetail only.
const ADMIN = { name: "Dewi Lestari", role: "admin" } as const;
const CREATOR = { name: "Rangga Pratama", role: "creator" } as const;

function rawEvents(): RawTimelineEvent[] {
  return [
    { type: "draft_approved", actor: ADMIN, timestamp: "2026-10-04T03:00:00.000Z" },
    {
      type: "draft_submitted",
      actor: CREATOR,
      timestamp: "2026-10-03T03:00:00.000Z",
      version: 2,
      link: "https://drive.google.com/file/d/draft-v2",
    },
    {
      type: "revision_requested",
      actor: ADMIN,
      timestamp: "2026-10-02T03:00:00.000Z",
      note: "Audio terlalu pelan.\nTambahkan subtitle.",
    },
    {
      type: "draft_submitted",
      actor: CREATOR,
      timestamp: "2026-10-01T03:00:00.000Z",
      version: 1,
      link: "https://drive.google.com/file/d/draft-v1",
    },
    { type: "scheduled", actor: ADMIN, timestamp: "2026-09-20T03:00:00.000Z" },
  ];
}

function rawDetail(overrides: Partial<RawContentDetail> = {}): RawContentDetail {
  return {
    content: {
      name: "Promo Lebaran",
      type: "specific",
      status: "draft_approved",
      deadline: "2026-10-12",
      brief: "Tunjukkan fitur cashback.",
    },
    events: rawEvents(),
    ...overrides,
  };
}

describe("toContentDetail", () => {
  it("carries the header over under the panel's names", () => {
    expect(toContentDetail(rawDetail(), "content-7")).toMatchObject({
      contentId: "content-7",
      name: "Promo Lebaran",
      type: "specific",
      status: "draft_approved",
      deadline: "2026-10-12",
      brief: "Tunjukkan fitur cashback.",
    });
  });

  it("reads a missing brief as an empty one", () => {
    const raw = rawDetail();
    const detail = toContentDetail({ ...raw, content: { ...raw.content, brief: null } }, "content-7");

    expect(detail.brief).toBe("");
  });

  describe("timeline", () => {
    it("keeps each event with who did it, in which role, and when", () => {
      const { events } = toContentDetail(rawDetail(), "content-7");

      expect(events[0]).toEqual({
        type: "draft_approved",
        actorName: "Dewi Lestari",
        actorRole: "admin",
        timestamp: "2026-10-04T03:00:00.000Z",
        version: null,
        link: null,
        note: null,
      });
    });

    it("keeps what each event carries: a version and link, or a note with its line breaks", () => {
      const { events } = toContentDetail(rawDetail(), "content-7");

      expect(events[1]).toMatchObject({
        type: "draft_submitted",
        version: 2,
        link: "https://drive.google.com/file/d/draft-v2",
      });
      expect(events[2]).toMatchObject({
        type: "revision_requested",
        note: "Audio terlalu pelan.\nTambahkan subtitle.",
      });
    });

    it("orders the events newest first even when the API does not", () => {
      const { events } = toContentDetail(
        rawDetail({ events: rawEvents().reverse() }),
        "content-7",
      );

      expect(events.map((event) => event.type)).toEqual([
        "draft_approved",
        "draft_submitted",
        "revision_requested",
        "draft_submitted",
        "scheduled",
      ]);
    });

    it("does not reorder the events it was given", () => {
      const reversed = rawEvents().reverse();

      toContentDetail(rawDetail({ events: reversed }), "content-7");

      expect(reversed[0].type).toBe("scheduled");
    });

    it("leaves out an event of a type the panel does not know how to show", () => {
      const { events } = toContentDetail(
        rawDetail({
          events: [
            { type: "deadline_edited", actor: ADMIN, timestamp: "2026-10-05T03:00:00.000Z" },
            ...rawEvents(),
          ],
        }),
        "content-7",
      );

      expect(events).toHaveLength(5);
      expect(events[0].type).toBe("draft_approved");
    });

    it("accepts a content with no events yet", () => {
      expect(toContentDetail(rawDetail({ events: [] }), "content-7")).toMatchObject({
        events: [],
        drafts: [],
      });
    });
  });

  describe("draft history", () => {
    it("lists every submitted draft, newest version first", () => {
      const { drafts } = toContentDetail(rawDetail(), "content-7");

      expect(drafts).toEqual([
        {
          version: 2,
          link: "https://drive.google.com/file/d/draft-v2",
          submittedAt: "2026-10-03T03:00:00.000Z",
        },
        {
          version: 1,
          link: "https://drive.google.com/file/d/draft-v1",
          submittedAt: "2026-10-01T03:00:00.000Z",
        },
      ]);
    });

    it("orders by version even when the API sends the events oldest first", () => {
      const { drafts } = toContentDetail(
        rawDetail({ events: rawEvents().reverse() }),
        "content-7",
      );

      expect(drafts.map((draft) => draft.version)).toEqual([2, 1]);
    });

    it.each([
      ["no version", { link: "https://drive.google.com/file/d/draft-v3" }],
      ["no link", { version: 3 }],
    ])("leaves out a submission with %s, which cannot be labelled or opened", (_label, fields) => {
      const { drafts } = toContentDetail(
        rawDetail({
          events: [
            {
              type: "draft_submitted",
              actor: CREATOR,
              timestamp: "2026-10-05T03:00:00.000Z",
              ...fields,
            },
            ...rawEvents(),
          ],
        }),
        "content-7",
      );

      expect(drafts.map((draft) => draft.version)).toEqual([2, 1]);
    });
  });
});

describe("fetchContentDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function respond(status: number, body: unknown) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }

  it("asks this app's API proxy for the content's timeline without caching", async () => {
    const fetchSpy = respond(200, rawDetail());

    await fetchContentDetail("content-7");

    expect(fetchSpy).toHaveBeenCalledWith("/api/contents/content-7/timeline", {
      cache: "no-store",
    });
  });

  it("answers with the detail the adapter builds for that content", async () => {
    respond(200, rawDetail());

    await expect(fetchContentDetail("content-7")).resolves.toEqual(
      toContentDetail(rawDetail(), "content-7"),
    );
  });

  it("encodes the id so it cannot reach another API path", async () => {
    const fetchSpy = respond(200, rawDetail());

    await fetchContentDetail("../creators/x?y=1");

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/contents/..%2Fcreators%2Fx%3Fy%3D1/timeline");
  });

  it.each([400, 403, 404, 500])("turns HTTP %i into an error carrying that status", async (status) => {
    respond(status, { message: "Konten tidak ditemukan" });

    const failure = fetchContentDetail("content-7");

    await expect(failure).rejects.toBeInstanceOf(ContentDetailError);
    await expect(failure).rejects.toMatchObject({ status });
  });

  it("lets a network failure through as a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchContentDetail("content-7")).rejects.toThrow("Failed to fetch");
  });
});
