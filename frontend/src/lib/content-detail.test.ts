import {
  ContentDetailError,
  describeJourney,
  fetchContentDetail,
  toContentDetail,
  type RawContentDetail,
  type RawContentEvent,
} from "./content-detail";

// GET /api/contents/:id (admin) and GET /me/contents/:id (creator) as PBI 6 answers them.
// One fixture per test group, so a contract change is a change here and in toContentDetail.
function raw(overrides: Partial<RawContentDetail> = {}): RawContentDetail {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Evg_Rangga_30092026",
    type: "evergreen",
    brief: "",
    deadline: "2026-09-30",
    status: "draft_review",
    creatorName: "Rangga Pratama",
    tags: [],
    waitingOn: "admin",
    latestSubmissionId: "22222222-2222-2222-2222-222222222222",
    creatorActions: [],
    events: [
      {
        id: "sub-2",
        type: "draft_submitted",
        at: "2026-09-20T10:00:00.000Z",
        actor: { name: "Rangga Pratama", role: "creator" },
        payload: { version: 2, link: "https://drive.google.com/draft-v2" },
      },
      {
        id: "11111111-1111-1111-1111-111111111111:scheduled",
        type: "scheduled",
        at: "2026-09-01T03:00:00.000Z",
        actor: { name: null, role: "admin" },
      },
    ],
    ...overrides,
  };
}

describe("toContentDetail", () => {
  it("carries the API's words over to the panel's names", () => {
    expect(toContentDetail(raw())).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Evg_Rangga_30092026",
      type: "evergreen",
      brief: "",
      deadline: "2026-09-30",
      status: "draft_review",
      creatorName: "Rangga Pratama",
      waitingOn: "admin",
      latestSubmissionId: "22222222-2222-2222-2222-222222222222",
      creatorActions: [],
    });
  });

  it("keeps the tags as the API lists them, in its order", () => {
    const detail = toContentDetail(
      raw({ tags: ["late_submission", "overdue", "approval_bypassed"] }),
    );

    expect(detail.tags).toEqual(["late_submission", "overdue", "approval_bypassed"]);
  });

  it("keeps the endpoint's newest-first event order instead of re-sorting it", () => {
    const { events } = toContentDetail(raw());

    expect(events.map((event) => event.id)).toEqual([
      "sub-2",
      "11111111-1111-1111-1111-111111111111:scheduled",
    ]);
  });

  it("passes the journey through unchanged", () => {
    const { events } = toContentDetail(raw());

    expect(events[0]).toEqual(raw().events[0]);
  });
});

describe("fetchContentDetail", () => {
  function answer(status: number, body: unknown = raw()) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks this app's API proxy for the content, without caching, as the admin", async () => {
    const fetchSpy = answer(200);

    const detail = await fetchContentDetail(
      "11111111-1111-1111-1111-111111111111",
      "admin",
    );

    expect(fetchSpy).toHaveBeenCalledWith("/api/contents/11111111-1111-1111-1111-111111111111", {
      cache: "no-store",
    });
    expect(detail.name).toBe("Evg_Rangga_30092026");
  });

  it("asks the creator-scoped route when a creator opens the panel", async () => {
    const fetchSpy = answer(200);

    await fetchContentDetail("11111111-1111-1111-1111-111111111111", "creator");

    expect(fetchSpy).toHaveBeenCalledWith("/api/me/contents/11111111-1111-1111-1111-111111111111", {
      cache: "no-store",
    });
  });

  it("encodes the id so a crafted value cannot climb out of the path (OWASP A01)", async () => {
    const fetchSpy = answer(200);

    await fetchContentDetail("../../me/contents", "admin");

    expect(fetchSpy).toHaveBeenCalledWith("/api/contents/..%2F..%2Fme%2Fcontents", {
      cache: "no-store",
    });
  });

  it("hands a cancel signal on to the request when one is given", async () => {
    const fetchSpy = answer(200);
    const controller = new AbortController();

    await fetchContentDetail("11111111-1111-1111-1111-111111111111", "admin", controller.signal);

    expect(fetchSpy).toHaveBeenCalledWith("/api/contents/11111111-1111-1111-1111-111111111111", {
      cache: "no-store",
      signal: controller.signal,
    });
  });

  it("keeps the status so a 404 reads differently from a failure", async () => {
    answer(404);

    await expect(
      fetchContentDetail("11111111-1111-1111-1111-111111111111", "admin"),
    ).rejects.toThrow(ContentDetailError);
  });
});

describe("describeJourney", () => {
  const ADMIN = { name: null, role: "admin" } as const;
  const CREATOR = { name: "Rangga Pratama", role: "creator" } as const;

  function event(overrides: Partial<RawContentEvent> & Pick<RawContentEvent, "id" | "type">) {
    return { at: "2026-09-20T10:00:00.000Z", actor: ADMIN, ...overrides } as RawContentEvent;
  }

  // Newest first, as the endpoint sends it.
  const journey: RawContentEvent[] = [
    event({ id: "link", type: "link_submitted", actor: CREATOR, payload: { link: "https://www.instagram.com/reel/abc" } }),
    event({ id: "approved", type: "draft_approved" }),
    event({ id: "sub-3", type: "draft_submitted", actor: CREATOR, payload: { version: 3, link: "https://drive.google.com/v3" } }),
    event({ id: "rev-2", type: "revision_requested", payload: { note: "Subtitle belum ada." } }),
    event({ id: "sub-2", type: "draft_submitted", actor: CREATOR, payload: { version: 2, link: "https://drive.google.com/v2", note: "Opening sudah diganti." } }),
    event({ id: "rev-1", type: "revision_requested", payload: { note: "Audio terlalu pelan.\nTambahkan subtitle." } }),
    event({ id: "sub-1", type: "draft_submitted", actor: CREATOR, payload: { version: 1, link: "https://drive.google.com/v1" } }),
    event({ id: "scheduled", type: "scheduled" }),
  ];

  it("keeps every event, in the order it was given, with the event itself", () => {
    const steps = describeJourney(journey);

    expect(steps.map((step) => step.event.id)).toEqual(journey.map((item) => item.id));
    expect(steps[0].event).toBe(journey[0]);
  });

  it("titles each kind of event, with the draft version and the revision round", () => {
    expect(describeJourney(journey).map((step) => step.title)).toEqual([
      "Link video dikirim",
      "Draft di-approve",
      "Draft v3 dikirim",
      "Revisi ke-2 diminta",
      "Draft v2 dikirim",
      "Revisi ke-1 diminta",
      "Draft v1 dikirim",
      "Ditambahkan Admin",
    ]);
  });

  it("counts a draft's version from the oldest when the API sends none", () => {
    const steps = describeJourney([
      event({ id: "b", type: "draft_submitted", actor: CREATOR }),
      event({ id: "a", type: "draft_submitted", actor: CREATOR }),
    ]);

    expect(steps.map((step) => step.title)).toEqual(["Draft v2 dikirim", "Draft v1 dikirim"]);
  });

  it("labels a link by what it opens, and only when there is one", () => {
    const steps = describeJourney(journey);

    expect(steps[0].linkLabel).toBe("Buka video");
    expect(steps[2].linkLabel).toBe("Buka draft v3");
    expect(steps[1].linkLabel).toBeNull();
    expect(describeJourney([event({ id: "a", type: "draft_submitted" })])[0].linkLabel).toBeNull();
  });

  it("has no link label for a kind of event that never carries a link, even if one is sent", () => {
    const [step] = describeJourney([
      event({ id: "a", type: "draft_approved", payload: { link: "https://example.com/stray" } }),
    ]);

    expect(step.linkLabel).toBeNull();
  });

  it("signs an admin's note as the admin's and a creator's with their name", () => {
    const steps = describeJourney(journey);

    expect(steps[3].noteBy).toBe("Catatan Admin");
    expect(steps[4].noteBy).toBe("Catatan Rangga Pratama");
  });

  it("signs a creator's note generically when the API sends no name", () => {
    const [step] = describeJourney([
      event({ id: "a", type: "draft_submitted", actor: { name: null, role: "creator" }, payload: { note: "Sudah diperbaiki." } }),
    ]);

    expect(step.noteBy).toBe("Catatan kreator");
  });

  it.each([
    ["no payload", undefined],
    ["no note", {}],
    ["an empty note", { note: "" }],
    ["a whitespace-only note", { note: "  \n " }],
  ])("signs nothing for an event with %s", (_label, payload) => {
    const [step] = describeJourney([event({ id: "a", type: "revision_requested", payload })]);

    expect(step.noteBy).toBeNull();
  });

  it("describes an empty journey as empty", () => {
    expect(describeJourney([])).toEqual([]);
  });

  it("does not reorder or change the events it was given", () => {
    const before = journey.map((item) => item.id);

    describeJourney(journey);

    expect(journey.map((item) => item.id)).toEqual(before);
  });
});
