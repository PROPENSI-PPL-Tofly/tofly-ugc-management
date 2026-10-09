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
      note: "Opening sudah aku ganti kak.",
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
      creatorName: "Rangga Pratama",
      periodNumber: 2,
    },
    events: rawEvents(),
    ...overrides,
  };
}

/** The fixture with its content fields replaced, for tests about the header or the status. */
function rawWithContent(content: Partial<RawContentDetail["content"]>): RawContentDetail {
  const raw = rawDetail();
  return { ...raw, content: { ...raw.content, ...content } };
}

function draft(timestamp: string, fields: Partial<RawTimelineEvent> = {}): RawTimelineEvent {
  return { type: "draft_submitted", actor: CREATOR, timestamp, ...fields };
}

function revision(timestamp: string, note = "Perbaiki audio."): RawTimelineEvent {
  return { type: "revision_requested", actor: ADMIN, timestamp, note };
}

describe("toContentDetail", () => {
  describe("header", () => {
    it("carries the header over under the panel's names", () => {
      expect(toContentDetail(rawDetail(), "content-7")).toMatchObject({
        contentId: "content-7",
        name: "Promo Lebaran",
        type: "specific",
        status: "draft_approved",
        deadline: "2026-10-12",
        brief: "Tunjukkan fitur cashback.",
        creatorName: "Rangga Pratama",
        periodNumber: 2,
      });
    });

    it("reads a missing brief as an empty one", () => {
      expect(toContentDetail(rawWithContent({ brief: null }), "content-7").brief).toBe("");
    });

    it("reads the creator and period the API does not send as unknown", () => {
      const detail = toContentDetail(
        rawWithContent({ creatorName: undefined, periodNumber: undefined }),
        "content-7",
      );

      expect(detail).toMatchObject({ creatorName: null, periodNumber: null });
    });
  });

  describe("timeline", () => {
    it("keeps each event with who did it, in which role, and when", () => {
      const { events } = toContentDetail(rawDetail(), "content-7");

      expect(events[0]).toEqual({
        type: "draft_approved",
        title: "Draft di-approve",
        actorName: "Dewi Lestari",
        actorRole: "admin",
        timestamp: "2026-10-04T03:00:00.000Z",
        link: null,
        linkLabel: null,
        note: null,
        noteBy: null,
      });
    });

    it("titles every kind of event the way the prototype words it", () => {
      const { events } = toContentDetail(
        rawDetail({
          events: [
            {
              type: "link_submitted",
              actor: CREATOR,
              timestamp: "2026-10-06T03:00:00.000Z",
              link: "https://www.instagram.com/reel/abc",
            },
            {
              type: "creator_comment",
              actor: CREATOR,
              timestamp: "2026-10-05T03:00:00.000Z",
              note: "Besok aku upload ya kak.",
            },
            ...rawEvents(),
          ],
        }),
        "content-7",
      );

      expect(events.map((event) => event.title)).toEqual([
        "Link video dikirim",
        "Komentar kreator",
        "Draft di-approve",
        "Draft v2 dikirim",
        "Revisi ke-1 diminta",
        "Draft v1 dikirim",
        "Dijadwalkan",
      ]);
    });

    it("orders the events newest first even when the API does not", () => {
      const { events } = toContentDetail(rawDetail({ events: rawEvents().reverse() }), "content-7");

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

    it("keeps events of the same moment in the order the API sent them", () => {
      const moment = "2026-10-01T03:00:00.000Z";
      const { events } = toContentDetail(
        rawDetail({
          events: [
            { type: "draft_approved", actor: ADMIN, timestamp: moment },
            { type: "scheduled", actor: ADMIN, timestamp: moment },
          ],
        }),
        "content-7",
      );

      expect(events.map((event) => event.type)).toEqual(["draft_approved", "scheduled"]);
    });

    it("puts an event whose timestamp cannot be read at the bottom, not in a random place", () => {
      const { events } = toContentDetail(
        rawDetail({
          events: [
            { type: "scheduled", actor: ADMIN, timestamp: "kemarin" },
            { type: "draft_approved", actor: ADMIN, timestamp: "2026-10-04T03:00:00.000Z" },
            draft("2026-10-01T03:00:00.000Z"),
          ],
        }),
        "content-7",
      );

      expect(events.map((event) => event.type)).toEqual([
        "draft_approved",
        "draft_submitted",
        "scheduled",
      ]);
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
      expect(toContentDetail(rawDetail({ events: [] }), "content-7").events).toEqual([]);
    });
  });

  describe("draft versions and revision rounds", () => {
    it("labels each draft with the version the API gives it", () => {
      const { events } = toContentDetail(rawDetail(), "content-7");

      expect(events[1]).toMatchObject({
        title: "Draft v2 dikirim",
        link: "https://drive.google.com/file/d/draft-v2",
        linkLabel: "Buka draft v2",
      });
      expect(events[3]).toMatchObject({ title: "Draft v1 dikirim", linkLabel: "Buka draft v1" });
    });

    it("counts the versions in the order they happened when the API sends none", () => {
      const { events } = toContentDetail(
        rawDetail({
          // Newest first, as the API answers: the count must still start from the oldest.
          events: [
            draft("2026-10-05T03:00:00.000Z"),
            draft("2026-10-03T03:00:00.000Z"),
            draft("2026-10-01T03:00:00.000Z"),
          ],
        }),
        "content-7",
      );

      expect(events.map((event) => event.title)).toEqual([
        "Draft v3 dikirim",
        "Draft v2 dikirim",
        "Draft v1 dikirim",
      ]);
    });

    it("numbers the revision rounds from the oldest", () => {
      const { events } = toContentDetail(
        rawDetail({
          events: [
            revision("2026-10-04T03:00:00.000Z"),
            draft("2026-10-03T03:00:00.000Z"),
            revision("2026-10-02T03:00:00.000Z"),
            draft("2026-10-01T03:00:00.000Z"),
          ],
        }),
        "content-7",
      );

      expect(events.map((event) => event.title)).toEqual([
        "Revisi ke-2 diminta",
        "Draft v2 dikirim",
        "Revisi ke-1 diminta",
        "Draft v1 dikirim",
      ]);
    });

    it("gives a link its label only when there is a link to open", () => {
      const { events } = toContentDetail(
        rawDetail({
          events: [
            {
              type: "link_submitted",
              actor: CREATOR,
              timestamp: "2026-10-06T03:00:00.000Z",
              link: "https://www.tiktok.com/@rangga/video/1",
            },
            draft("2026-10-01T03:00:00.000Z"),
          ],
        }),
        "content-7",
      );

      expect(events[0]).toMatchObject({
        link: "https://www.tiktok.com/@rangga/video/1",
        linkLabel: "Buka video",
      });
      expect(events[1]).toMatchObject({ link: null, linkLabel: null });
    });

    it("has no link label for an event that never carries a link, even if one is sent", () => {
      const { events } = toContentDetail(
        rawDetail({
          events: [
            {
              type: "draft_approved",
              actor: ADMIN,
              timestamp: "2026-10-04T03:00:00.000Z",
              link: "https://example.com/stray",
            },
          ],
        }),
        "content-7",
      );

      expect(events[0]).toMatchObject({ link: null, linkLabel: null });
    });
  });

  describe("notes", () => {
    it("signs an admin's revision note as the admin's, with its line breaks kept", () => {
      const { events } = toContentDetail(rawDetail(), "content-7");

      expect(events[2]).toMatchObject({
        note: "Audio terlalu pelan.\nTambahkan subtitle.",
        noteBy: "Catatan Admin",
      });
    });

    it("signs a creator's note with the creator's name", () => {
      const { events } = toContentDetail(rawDetail(), "content-7");

      expect(events[1]).toMatchObject({
        note: "Opening sudah aku ganti kak.",
        noteBy: "Catatan Rangga Pratama",
      });
    });

    it.each([
      ["an empty", ""],
      ["a whitespace-only", "  \n\t "],
      ["a missing", null],
    ])("shows no note for %s one", (_label, note) => {
      const { events } = toContentDetail(
        rawDetail({ events: [draft("2026-10-01T03:00:00.000Z", { note })] }),
        "content-7",
      );

      expect(events[0]).toMatchObject({ note: null, noteBy: null });
    });
  });

  describe("current step", () => {
    it.each([
      ["scheduled", "creator", "Kirim draft"],
      ["draft_revision", "creator", "Kirim draft revisi"],
      ["draft_approved", "creator", "Kirim link video final"],
      ["draft_review", "admin", "Review draft v2"],
      // Until the six-status migration lands, a resubmitted draft still arrives as this.
      ["draft_revised", "admin", "Review draft v2"],
    ] as const)("for %s waits on the %s to: %s", (status, waitingFor, title) => {
      const detail = toContentDetail(rawWithContent({ status }), "content-7");

      expect(detail.currentStep).toEqual({ waitingFor, title });
    });

    it("has none once the video link is in: nothing is left to do", () => {
      const detail = toContentDetail(rawWithContent({ status: "link_submitted" }), "content-7");

      expect(detail.currentStep).toBeNull();
    });

    it("names the newest draft for review even when the API lists it last", () => {
      const detail = toContentDetail(
        { ...rawWithContent({ status: "draft_review" }), events: rawEvents().reverse() },
        "content-7",
      );

      expect(detail.currentStep?.title).toBe("Review draft v2");
    });

    it("asks for a review without a version when no draft is on the timeline", () => {
      const detail = toContentDetail(
        { ...rawWithContent({ status: "draft_review" }), events: [] },
        "content-7",
      );

      expect(detail.currentStep).toEqual({ waitingFor: "admin", title: "Review draft" });
    });

    it("has none for a status this version of the app does not know", () => {
      const raw = rawWithContent({});
      const detail = toContentDetail(
        { ...raw, content: { ...raw.content, status: "archived" as never } },
        "content-7",
      );

      expect(detail.currentStep).toBeNull();
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
