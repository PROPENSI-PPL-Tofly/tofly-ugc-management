import { STAT_CARDS, statCardHref } from "./creator-dashboard";
import { TASK_STATUS_FILTERS } from "./my-tasks";

describe("STAT_CARDS", () => {
  it("has exactly three status cards, in the order the dashboard shows them", () => {
    expect(STAT_CARDS.map((card) => card.status)).toEqual([
      "scheduled",
      "draft_revision",
      "draft_approved",
    ]);
  });

  it("labels each card by what the creator still has to do", () => {
    expect(STAT_CARDS.map((card) => card.label)).toEqual([
      "Draft Perlu Disubmit",
      "Draft Perlu Direvisi",
      "Link Konten Perlu Diupload",
    ]);
  });

  it("counts one status per card, never the same status twice", () => {
    const statuses = STAT_CARDS.map((card) => card.status);

    expect(new Set(statuses).size).toBe(statuses.length);
  });

  it("only counts statuses Task Saya can be filtered by, so every card has somewhere to lead", () => {
    for (const card of STAT_CARDS) {
      expect(TASK_STATUS_FILTERS).toContain(card.status);
    }
  });

  it.each(["pending", "draft_review", "link_submitted"])(
    "has no card for %s, which is not the creator's move",
    (status) => {
      expect(STAT_CARDS.map((card) => card.status)).not.toContain(status);
    },
  );
});

describe("statCardHref", () => {
  it.each([
    ["scheduled", "/creator/tasks?status=scheduled"],
    ["draft_revision", "/creator/tasks?status=draft_revision"],
    ["draft_approved", "/creator/tasks?status=draft_approved"],
  ] as const)("opens Task Saya on %s", (status, href) => {
    expect(statCardHref(status)).toBe(href);
  });

  it("gives every card its own address", () => {
    const hrefs = STAT_CARDS.map((card) => statCardHref(card.status));

    expect(new Set(hrefs).size).toBe(STAT_CARDS.length);
  });
});
