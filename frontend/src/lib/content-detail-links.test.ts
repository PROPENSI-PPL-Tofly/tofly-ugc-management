import { describeJourney, type RawContentEvent } from "./content-detail";

function linkEvent(
  platform?: "instagram" | "tiktok",
  link = "https://instagram.com/p/x",
): RawContentEvent {
  return {
    id: "ev-1",
    type: "link_submitted",
    at: "2026-10-18T03:00:00.000Z",
    actor: { name: "Salsa Amelia", role: "creator" },
    payload: platform ? { link, platform } : { link },
  };
}

describe("the journey of a link (AC 12)", () => {
  it("names the platform each link was sent to, one event per link", () => {
    expect(describeJourney([linkEvent("instagram")])[0].title).toBe("Link Instagram dikirim");
    expect(describeJourney([linkEvent("tiktok", "https://tiktok.com/@a/video/1")])[0].title).toBe(
      "Link TikTok dikirim",
    );
  });

  it("says an event older than the new structure sent the video itself", () => {
    expect(describeJourney([linkEvent(undefined)])[0].title).toBe("Link video dikirim");
  });

  it("keeps the link itself on the step, whatever the platform", () => {
    expect(describeJourney([linkEvent("instagram")])[0].linkLabel).toBe("Buka video");
    expect(describeJourney([linkEvent(undefined)])[0].linkLabel).toBe("Buka video");
  });
});
