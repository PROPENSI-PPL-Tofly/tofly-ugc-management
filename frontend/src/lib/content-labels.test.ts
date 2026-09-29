import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES } from "./content-labels";

describe("CONTENT_STATUS_TONES", () => {
  it("gives every status a tone, so no status falls back to plain grey by accident", () => {
    expect(Object.keys(CONTENT_STATUS_TONES).sort()).toEqual(
      Object.keys(CONTENT_STATUS_LABELS).sort(),
    );
  });

  it("colours work by who holds it: amber when it came back, green once approved", () => {
    expect(CONTENT_STATUS_TONES.scheduled).toBe("neutral");
    expect(CONTENT_STATUS_TONES.draft_review).toBe("accent");
    expect(CONTENT_STATUS_TONES.draft_revised).toBe("accent");
    expect(CONTENT_STATUS_TONES.draft_revision).toBe("amber");
    expect(CONTENT_STATUS_TONES.draft_approved).toBe("green");
    expect(CONTENT_STATUS_TONES.link_submitted).toBe("green");
  });
});
