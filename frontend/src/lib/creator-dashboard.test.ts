import { contractLastDay, contractLastDayLabel, nearestDeadlineLabel, STAT_CARDS, statCardHref } from "./creator-dashboard";
import { aCreatorInvoice } from "./creator-invoice.builder";
import { TASK_STATUS_FILTERS } from "./my-tasks";

// PBI-37, 37.3: the creator's last day, read off GET /me/invoices. An early end moves the
// contract's endDate to the last day (37.1), so the same field serves every contract.
describe("contractLastDay", () => {
  it("is the end of the contract being billed now", () => {
    expect(
      contractLastDay([
        aCreatorInvoice({ periodNumber: 1, periodEnd: "2026-05-31", status: "paid" }),
        aCreatorInvoice({ periodNumber: 2, periodEnd: "2026-11-20", status: "cancelled" }),
      ]),
    ).toBe("2026-11-20");
  });

  // PBI-30: a renewal waiting to start is not the contract running now.
  it("is not a renewal that has not started", () => {
    expect(
      contractLastDay([
        aCreatorInvoice({ periodNumber: 1, periodEnd: "2026-11-20" }),
        aCreatorInvoice({ periodNumber: 2, periodEnd: "2027-05-31", notStarted: true }),
      ]),
    ).toBe("2026-11-20");
  });

  it("is unknown for a creator without invoices", () => {
    expect(contractLastDay([])).toBeNull();
  });
});

describe("contractLastDayLabel", () => {
  it("names the last day as a plain calendar day", () => {
    expect(contractLastDayLabel("2026-11-01")).toBe("Hari terakhir kontrak: 1 Nov 2026");
  });
});

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

  it("only counts statuses Tugas Saya can be filtered by, so every card has somewhere to lead", () => {
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
    ["scheduled", "/creator/tasks?tab=action&status=scheduled"],
    ["draft_revision", "/creator/tasks?tab=action&status=draft_revision"],
    ["draft_approved", "/creator/tasks?tab=action&status=draft_approved"],
  ] as const)("opens the tab that holds %s, narrowed to it", (status, href) => {
    expect(statCardHref(status)).toBe(href);
  });

  it("opens every card on Perlu Dikerjakan, where its count is part of the tab's own", () => {
    for (const card of STAT_CARDS) {
      expect(new URL(statCardHref(card.status), "http://localhost").searchParams.get("tab")).toBe(
        "action",
      );
    }
  });

  it("gives every card its own address", () => {
    const hrefs = STAT_CARDS.map((card) => statCardHref(card.status));

    expect(new Set(hrefs).size).toBe(STAT_CARDS.length);
  });
});

describe("nearestDeadlineLabel", () => {
  // Midday in Jakarta on 9 Oct 2026, well away from either midnight.
  const NOON = new Date("2026-10-09T05:00:00Z");

  it("counts the days left to the nearest open deadline", () => {
    expect(nearestDeadlineLabel("2026-10-12", NOON)).toBe("3 hari lagi");
  });

  it("reads one day on the eve of the deadline", () => {
    expect(nearestDeadlineLabel("2026-10-10", NOON)).toBe("1 hari lagi");
  });

  it("reads zero on the deadline itself", () => {
    expect(nearestDeadlineLabel("2026-10-09", NOON)).toBe("0 hari lagi");
  });

  it.each([
    ["2026-10-08", "Lewat 1 hari"],
    ["2026-10-07", "Lewat 2 hari"],
    ["2026-09-01", "Lewat 38 hari"],
  ])("says how late %s is, a deadline that has already passed", (deadline, label) => {
    expect(nearestDeadlineLabel(deadline, NOON)).toBe(label);
  });

  it("never reads a passed deadline as time still left", () => {
    expect(nearestDeadlineLabel("2026-10-07", NOON)).not.toContain("hari lagi");
  });

  it("turns from the last day to late at midnight in Jakarta", () => {
    // 17.00 UTC on the 10th is already 00.00 on the 11th in WIB.
    expect(nearestDeadlineLabel("2026-10-10", new Date("2026-10-10T16:59:59Z"))).toBe(
      "0 hari lagi",
    );
    expect(nearestDeadlineLabel("2026-10-10", new Date("2026-10-10T17:00:00Z"))).toBe(
      "Lewat 1 hari",
    );
  });

  it("counts across the end of a month and of a year", () => {
    expect(nearestDeadlineLabel("2026-11-01", NOON)).toBe("23 hari lagi");
    expect(nearestDeadlineLabel("2027-01-01", NOON)).toBe("84 hari lagi");
  });

  it("takes today from Jakarta, not from UTC", () => {
    // 17.00 UTC on the 9th is already 00.00 on the 10th in WIB.
    expect(nearestDeadlineLabel("2026-10-10", new Date("2026-10-09T16:59:59Z"))).toBe(
      "1 hari lagi",
    );
    expect(nearestDeadlineLabel("2026-10-10", new Date("2026-10-09T17:00:00Z"))).toBe(
      "0 hari lagi",
    );
  });

  it.each([
    ["no open task", null],
    ["an empty deadline", ""],
    ["a deadline that is not a calendar day", "segera"],
  ])("shows a dash for %s", (_label, deadline) => {
    expect(nearestDeadlineLabel(deadline, NOON)).toBe("—");
  });
});
