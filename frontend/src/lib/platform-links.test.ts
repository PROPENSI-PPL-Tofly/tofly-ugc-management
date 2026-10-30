import {
  H5_BUFFER_DAYS,
  latestDeadline,
  linkEventTitle,
  PLATFORM_LABELS,
  PLATFORMS,
  platformsOf,
  type ContentLink,
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

  it("says a replaced link was updated, not sent again", () => {
    expect(linkEventTitle("instagram", true)).toBe("Link Instagram diperbarui");
  });

  it("falls back to the video itself for an event older than the new structure", () => {
    expect(linkEventTitle(undefined)).toBe("Link video dikirim");
    expect(linkEventTitle(undefined, true)).toBe("Link video diperbarui");
  });
});

describe("latestDeadline", () => {
  it("holds the H-5 buffer the API holds", () => {
    expect(H5_BUFFER_DAYS).toBe(5);
  });

  it("is five days before the contract's last day", () => {
    expect(latestDeadline("2026-12-31")).toBe("2026-12-26");
    expect(latestDeadline("2026-06-30")).toBe("2026-06-25");
  });

  it("walks across a month end and a leap day without drifting", () => {
    expect(latestDeadline("2026-03-03")).toBe("2026-02-26");
    expect(latestDeadline("2028-03-01")).toBe("2028-02-25");
    expect(latestDeadline("2027-01-01")).toBe("2026-12-27");
  });

  it("gives the day before the contract end when it ends five days into a month", () => {
    expect(latestDeadline("2026-09-05")).toBe("2026-08-31");
  });
});

describe("platformsOf", () => {
  const link = (platform: "instagram" | "tiktok", url: string): ContentLink => ({
    platform,
    url,
    submittedAt: "2026-10-18T03:00:00.000Z",
  });

  it("names every platform with a submitted link, Instagram first", () => {
    expect(
      platformsOf([link("tiktok", "https://tiktok.com/@a/video/1"), link("instagram", "https://instagram.com/p/x")]),
    ).toEqual(["instagram", "tiktok"]);
  });

  it("names a platform once whatever the number of links", () => {
    expect(platformsOf([link("instagram", "https://instagram.com/p/x")])).toEqual(["instagram"]);
  });

  it("names nothing for a content with no links yet", () => {
    expect(platformsOf([])).toEqual([]);
    expect(platformsOf(undefined)).toEqual([]);
  });
});
