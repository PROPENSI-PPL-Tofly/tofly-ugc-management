import { toFinalizeReport } from "./finalize-report";

/** One frozen link the last sync did not update, as the API writes it (28.2's NotUpdatedLinkDto). */
const NOT_UPDATED = {
  contentId: "c-1",
  contentName: "Evg_1_RanggaPratama_12102026",
  platform: "tiktok",
  state: "sync_failed",
};

/** One link still waiting for its metric, as the API writes it (28.2's WaitingBonusLinkDto). */
const WAITING = {
  contentId: "c-2",
  contentName: "Review Kopi",
  platform: "instagram",
  metric: "views",
  state: "not_connected",
};

describe("toFinalizeReport", () => {
  it("reads the last sync report and the bonus gaps off Finalize's answer (AC 8, 9)", () => {
    expect(
      toFinalizeReport({
        lastSync: { status: "done", notUpdated: [NOT_UPDATED] },
        bonusDataGaps: { available: true, waiting: [], noDataLines: [] },
      }),
    ).toEqual({
      lastSync: { status: "done", notUpdated: [NOT_UPDATED] },
      bonusGaps: { available: true, waiting: [] },
    });
  });

  // Finalize now always lists the waiting links (28.1 connected): the old marker is no answer.
  it("reads the old not-yet-available marker as no list at all", () => {
    expect(
      toFinalizeReport({ bonusDataGaps: { available: false, reason: "PBI_28_1_PENDING" } }).bonusGaps,
    ).toBeNull();
  });

  it("reads the waiting links the moment the gaps open (AC 9)", () => {
    const report = toFinalizeReport({
      lastSync: { status: "done", notUpdated: [] },
      bonusDataGaps: { available: true, waiting: [WAITING] },
    });

    expect(report.bonusGaps).toEqual({ available: true, waiting: [WAITING] });
  });

  it.each(["failed", "timed_out"] as const)(
    "reads a last sync that %s with every link it left behind (AC 8)",
    (status) => {
      const report = toFinalizeReport({ lastSync: { status, notUpdated: [NOT_UPDATED] } });

      expect(report.lastSync).toEqual({ status, notUpdated: [NOT_UPDATED] });
    },
  );

  it("drops an entry it cannot read rather than making one up (OWASP A05)", () => {
    const report = toFinalizeReport({
      lastSync: {
        status: "done",
        notUpdated: [
          NOT_UPDATED,
          { contentId: "c-3", contentName: "Rusak", platform: "youtube", state: "synced" },
          "bukan entri",
          { contentId: 42, contentName: "Rusak", platform: "tiktok", state: "synced" },
        ],
      },
    });

    expect(report.lastSync?.notUpdated).toEqual([NOT_UPDATED]);
  });

  it("reads an answer from before the report existed as no report at all", () => {
    expect(toFinalizeReport({})).toEqual({ lastSync: null, bonusGaps: null });
    expect(toFinalizeReport("bukan jawaban")).toEqual({ lastSync: null, bonusGaps: null });
    expect(
      toFinalizeReport({ lastSync: { status: "entah", notUpdated: [] }, bonusDataGaps: { available: true } }),
    ).toEqual({ lastSync: null, bonusGaps: null });
  });
});
