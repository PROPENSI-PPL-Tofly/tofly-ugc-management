import {
  canSendLinks,
  draftFromLinks,
  isLinkDraftDirty,
  linkChanges,
  linkProblem,
  linkProblems,
  MAX_LINK_LENGTH,
  VIDEO_PLATFORMS,
  type LinkDraft,
} from "./video-links";

const INSTAGRAM_REEL = "https://www.instagram.com/reel/C8abc12345/";
const TIKTOK_VIDEO = "https://www.tiktok.com/@tofly/video/7400000000000000000";

const INSTAGRAM_ERROR = "Link harus dari Instagram (instagram.com/reel/… atau /p/…)";
const TIKTOK_ERROR = "Link harus dari TikTok (tiktok.com/@user/video/… atau vt.tiktok.com/…)";

const draft = (instagram = "", tiktok = ""): LinkDraft => ({ instagram, tiktok });

describe("linkProblem", () => {
  it.each([
    ["a reel", INSTAGRAM_REEL],
    ["a post", "https://instagram.com/p/DAbC123xyz"],
    ["a TV page", "http://instagram.com/tv/DAbC123xyz/"],
    ["a link with a share query", "https://www.instagram.com/reel/C8abc12345/?igsh=abc"],
    ["a reels page", "https://www.instagram.com/reels/C8abc12345/"],
    ["a reel under its owner's handle", "https://www.instagram.com/tofly.id/reel/C8abc12345/"],
  ])("accepts an Instagram link to %s", (_, link) => {
    expect(linkProblem("instagram", link)).toBeNull();
  });

  it.each([
    ["a video under a handle", TIKTOK_VIDEO],
    ["a mobile video page", "https://m.tiktok.com/@tofly/video/7400000000000000000"],
    ["a vt short link", "https://vt.tiktok.com/ZSabc123/"],
    ["a vm short link", "https://vm.tiktok.com/ZMabc123/"],
  ])("accepts a TikTok link to %s", (_, link) => {
    expect(linkProblem("tiktok", link)).toBeNull();
  });

  it.each([
    ["a profile", "https://www.instagram.com/tofly/"],
    ["a story", "https://www.instagram.com/stories/tofly/1234/"],
    ["a TikTok video", TIKTOK_VIDEO],
    ["a look-alike host", "https://instagram.com.evil.example/reel/C8abc12345/"],
    ["a scheme-less link", "instagram.com/reel/C8abc12345/"],
    ["a script link", "javascript:alert(1)"],
    ["a path that goes on past the post", "https://www.instagram.com/reel/C8abc12345/extra"],
    ["a link with its own port", "https://www.instagram.com:8443/reel/C8abc12345/"],
    ["a link carrying credentials", "https://user:pass@www.instagram.com/reel/C8abc12345/"],
  ])("refuses %s in the Instagram field with Instagram's own message", (_, link) => {
    expect(linkProblem("instagram", link)).toBe(INSTAGRAM_ERROR);
  });

  it.each([
    ["a profile", "https://www.tiktok.com/@tofly"],
    ["a video without a handle", "https://www.tiktok.com/video/7400000000000000000"],
    ["a short link with no code", "https://vt.tiktok.com/"],
    ["a video path that goes on", "https://www.tiktok.com/@tofly/video/7400000000000000000/extra"],
    ["a short link with two segments", "https://vm.tiktok.com/ZMabc123/extra"],
    ["an Instagram reel", INSTAGRAM_REEL],
    ["a look-alike host", "https://tiktok.com.evil.example/@tofly/video/7400000000000000000"],
  ])("refuses %s in the TikTok field with TikTok's own message", (_, link) => {
    expect(linkProblem("tiktok", link)).toBe(TIKTOK_ERROR);
  });

  it("leaves an empty or blank field without a problem, since only one link is required", () => {
    expect(linkProblem("instagram", "")).toBeNull();
    expect(linkProblem("tiktok", "   ")).toBeNull();
  });

  it("accepts a link of exactly 300 characters", () => {
    const base = "https://www.instagram.com/reel/";
    const link = base + "a".repeat(MAX_LINK_LENGTH - base.length);

    expect(link).toHaveLength(MAX_LINK_LENGTH);
    expect(linkProblem("instagram", link)).toBeNull();
  });

  it("refuses a link of 301 characters before checking its platform", () => {
    const base = "https://www.instagram.com/reel/";
    const link = base + "a".repeat(MAX_LINK_LENGTH + 1 - base.length);

    expect(linkProblem("instagram", link)).toBe("Link maksimal 300 karakter");
  });

  it("judges the trimmed link, so surrounding spaces from a paste do not count", () => {
    expect(linkProblem("instagram", `  ${INSTAGRAM_REEL}  `)).toBeNull();
  });
});

describe("draftFromLinks", () => {
  it("opens empty fields when nothing is sent yet", () => {
    expect(draftFromLinks([])).toEqual(draft());
  });

  it("fills each platform's field with the link already sent", () => {
    expect(
      draftFromLinks([
        { platform: "tiktok", url: TIKTOK_VIDEO },
        { platform: "instagram", url: INSTAGRAM_REEL },
      ]),
    ).toEqual(draft(INSTAGRAM_REEL, TIKTOK_VIDEO));
  });

  it("leaves out a link kept from before platforms were recorded", () => {
    expect(draftFromLinks([{ platform: null, url: "https://example.com/old" }])).toEqual(draft());
  });
});

describe("linkProblems", () => {
  it("names a problem only for the platforms on show", () => {
    expect(linkProblems(["tiktok"], draft("not a link", "nope"))).toEqual({
      tiktok: TIKTOK_ERROR,
    });
  });

  it("refuses emptying a link that was already sent, since a sent link can only be replaced", () => {
    const sent = draft(INSTAGRAM_REEL);

    expect(linkProblems(VIDEO_PLATFORMS, draft(), sent)).toEqual({
      instagram: "Link yang sudah dikirim tidak bisa dikosongkan. Ganti dengan link baru.",
    });
  });

  it("has no problem for a valid form", () => {
    expect(linkProblems(VIDEO_PLATFORMS, draft(INSTAGRAM_REEL, TIKTOK_VIDEO))).toEqual({});
  });
});

describe("linkChanges", () => {
  it("adds every filled link on a first submit", () => {
    expect(linkChanges(VIDEO_PLATFORMS, draft(), draft(INSTAGRAM_REEL, TIKTOK_VIDEO))).toEqual({
      added: [
        { platform: "instagram", url: INSTAGRAM_REEL },
        { platform: "tiktok", url: TIKTOK_VIDEO },
      ],
      replaced: [],
    });
  });

  it("adds only the new platform's link when one is added later", () => {
    const sent = draft(INSTAGRAM_REEL);

    expect(linkChanges(VIDEO_PLATFORMS, sent, draft(INSTAGRAM_REEL, TIKTOK_VIDEO))).toEqual({
      added: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
      replaced: [],
    });
  });

  it("replaces a sent link that was changed, sending it trimmed", () => {
    const sent = draft(INSTAGRAM_REEL);
    const other = "https://www.instagram.com/p/DAbC123xyz/";

    expect(linkChanges(VIDEO_PLATFORMS, sent, draft(` ${other} `))).toEqual({
      added: [],
      replaced: [{ platform: "instagram", url: other }],
    });
  });

  it("treats a sent link that only gained spaces as unchanged", () => {
    const sent = draft(INSTAGRAM_REEL);

    expect(linkChanges(VIDEO_PLATFORMS, sent, draft(`${INSTAGRAM_REEL} `))).toEqual({
      added: [],
      replaced: [],
    });
  });

  it("ignores a platform that is not on show", () => {
    expect(linkChanges(["instagram"], draft(), draft("", TIKTOK_VIDEO))).toEqual({
      added: [],
      replaced: [],
    });
  });
});

describe("canSendLinks", () => {
  it("is closed until at least one link is filled", () => {
    expect(canSendLinks(VIDEO_PLATFORMS, draft())).toBe(false);
  });

  it("opens once one valid link is filled", () => {
    expect(canSendLinks(VIDEO_PLATFORMS, draft("", TIKTOK_VIDEO))).toBe(true);
  });

  it("stays closed while any field has a problem, even with another link valid", () => {
    expect(canSendLinks(VIDEO_PLATFORMS, draft(INSTAGRAM_REEL, "https://youtube.com/x"))).toBe(
      false,
    );
  });

  it("stays closed when nothing changed from the links already sent", () => {
    const sent = draft(INSTAGRAM_REEL);

    expect(canSendLinks(VIDEO_PLATFORMS, sent, sent)).toBe(false);
  });
});

describe("isLinkDraftDirty", () => {
  it("is clean while the fields read as they opened", () => {
    expect(isLinkDraftDirty(draft(INSTAGRAM_REEL), draft(INSTAGRAM_REEL))).toBe(false);
  });

  it("is dirty once any field is typed in", () => {
    expect(isLinkDraftDirty(draft(), draft("h"))).toBe(true);
  });
});
