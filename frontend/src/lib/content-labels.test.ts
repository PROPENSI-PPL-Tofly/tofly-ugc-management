import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TAG_LABELS,
  CONTENT_TAG_TONES,
  contentStatusDisplay,
} from "./content-labels";

describe("CONTENT_STATUS_LABELS", () => {
  it("names exactly the six lifecycle statuses, in lifecycle order", () => {
    expect(Object.entries(CONTENT_STATUS_LABELS)).toEqual([
      ["pending", "Pending"],
      ["scheduled", "Scheduled"],
      ["draft_review", "Draft Menunggu Review"],
      ["draft_revision", "Draft Perlu Revisi"],
      ["draft_approved", "Draft Approved"],
      ["link_submitted", "Content Link Submitted"],
    ]);
  });
});

describe("CONTENT_STATUS_TONES", () => {
  it("gives every status a tone, so no status falls back to plain grey by accident", () => {
    expect(Object.keys(CONTENT_STATUS_TONES).sort()).toEqual(
      Object.keys(CONTENT_STATUS_LABELS).sort(),
    );
  });

  it("colours work by who holds it: amber when it came back, green once approved", () => {
    expect(CONTENT_STATUS_TONES.scheduled).toBe("neutral");
    expect(CONTENT_STATUS_TONES.pending).toBe("accent");
    expect(CONTENT_STATUS_TONES.draft_review).toBe("accent");
    expect(CONTENT_STATUS_TONES.draft_revision).toBe("amber");
    expect(CONTENT_STATUS_TONES.draft_approved).toBe("green");
    expect(CONTENT_STATUS_TONES.link_submitted).toBe("green");
  });
});

describe("CONTENT_TAG_LABELS", () => {
  it("names the three tags the API sends, in its order", () => {
    expect(Object.entries(CONTENT_TAG_LABELS)).toEqual([
      ["overdue", "Overdue"],
      ["late_submission", "Late Submission"],
      ["approval_bypassed", "Approval di-bypass"],
    ]);
  });
});

describe("CONTENT_TAG_TONES", () => {
  it("marks a link still owed red, a link that came late a softer red, and a skipped approval amber", () => {
    expect(CONTENT_TAG_TONES).toEqual({
      overdue: "red",
      late_submission: "redSoft",
      approval_bypassed: "amber",
    });
  });
});

// QA: content an early end closed kept reading "Scheduled", as if the creator still owed it.
describe("contentStatusDisplay", () => {
  it("reads a closed content as Ditutup, in the quiet tone, whatever status it stopped at", () => {
    expect(contentStatusDisplay({ status: "scheduled", closedAt: "2026-11-20T03:00:00.000Z" })).toEqual({
      label: "Ditutup",
      tone: "neutral",
    });
    expect(contentStatusDisplay({ status: "draft_revision", closedAt: "2026-11-20T03:00:00.000Z" })).toEqual({
      label: "Ditutup",
      tone: "neutral",
    });
  });

  it("reads an open content by its status and that status's tone", () => {
    expect(contentStatusDisplay({ status: "draft_revision", closedAt: null })).toEqual({
      label: "Draft Perlu Revisi",
      tone: "amber",
    });
    expect(contentStatusDisplay({ status: "link_submitted" })).toEqual({
      label: "Content Link Submitted",
      tone: "green",
    });
  });

  it("shows a status newer than this build by its raw name, never a blank", () => {
    expect(contentStatusDisplay({ status: "archived" as never })).toEqual({ label: "archived", tone: "neutral" });
  });
});
