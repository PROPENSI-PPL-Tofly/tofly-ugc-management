import {
  latestDeadline,
  linkEventTitle,
  PLATFORM_LABELS,
  PLATFORMS,
} from "./platform-links";

describe("the platform vocabulary", () => {
  it("names the two platforms the way the UI names them", () => {
    expect(PLATFORM_LABELS).toEqual({ instagram: "Instagram", tiktok: "TikTok" });
    expect(PLATFORMS).toEqual(["instagram", "tiktok"]);
  });
});

describe("linkEventTitle", () => {
  it("names one event per link and per platform", () => {
    expect(linkEventTitle("instagram")).toBe("Link Instagram dikirim");
    expect(linkEventTitle("tiktok")).toBe("Link TikTok dikirim");
  });

  it("says a replaced link took the place of another, not that it was sent again (AC 9)", () => {
    expect(linkEventTitle("instagram", true)).toBe("Link Instagram diganti");
  });

  it("falls back to the video itself for an event older than the new structure", () => {
    expect(linkEventTitle(undefined)).toBe("Link video dikirim");
    expect(linkEventTitle(undefined, true)).toBe("Link video diganti");
  });
});

describe("latestDeadline", () => {
  it("is five days before the contract's last day on the default buffer", () => {
    expect(latestDeadline("2026-12-31", 5)).toBe("2026-12-26");
    expect(latestDeadline("2026-06-30", 5)).toBe("2026-06-25");
  });

  // PBI-23 AC: the one buffer a Super Admin sets is also the H-n line.
  it.each([
    [1, "2026-12-30"],
    [9, "2026-12-22"],
    [14, "2026-12-17"],
  ])("is the configured %i days before the contract's last day", (bufferDays, expected) => {
    expect(latestDeadline("2026-12-31", bufferDays)).toBe(expected);
  });

  it("walks across a month end and a leap day without drifting", () => {
    expect(latestDeadline("2026-03-03", 5)).toBe("2026-02-26");
    expect(latestDeadline("2028-03-01", 5)).toBe("2028-02-25");
    expect(latestDeadline("2027-01-01", 5)).toBe("2026-12-27");
  });

  it("gives the day before the contract end when it ends five days into a month", () => {
    expect(latestDeadline("2026-09-05", 5)).toBe("2026-08-31");
  });
});
