import { describe, expect, it } from "vitest";
import {
  DATA_STATE_LABELS,
  canEnterManually,
  checkManualInput,
  formatMetric,
  stateTip,
  type LinkPerformance,
} from "./link-performance";

function performance(overrides: Partial<LinkPerformance> = {}): LinkPerformance {
  return {
    views: null,
    likes: null,
    comments: null,
    shares: null,
    state: "waiting",
    lastSyncedAt: null,
    manualAt: null,
    ...overrides,
  };
}

describe("formatMetric (PBI-27 AC 2, 19)", () => {
  it("writes a number the Indonesian way, with dots", () => {
    expect(formatMetric(12400)).toBe("12.400");
    expect(formatMetric(999_999_999)).toBe("999.999.999");
  });

  it("shows a real 0 as 0 and no data as a dash, never as 0", () => {
    expect(formatMetric(0)).toBe("0");
    expect(formatMetric(null)).toBe("—");
  });
});

describe("DATA_STATE_LABELS (AC 3)", () => {
  it("names all six states the way the prototype does", () => {
    expect(DATA_STATE_LABELS).toEqual({
      not_connected: "Akun belum terhubung",
      waiting: "Menunggu data",
      synced: "Tersinkron",
      not_found: "Link tidak ditemukan",
      sync_failed: "Gagal sinkron",
      manual: "Diisi manual",
    });
  });
});

describe("stateTip (AC 3)", () => {
  it("gives the last sync time of a synced link", () => {
    expect(
      stateTip(performance({ state: "synced", lastSyncedAt: "2026-11-01T19:00:00.000Z" }), "Rani"),
    ).toBe("Sinkron terakhir 2 Nov 2026, 02.00 WIB. Sinkron otomatis tiap hari 02.00 WIB.");
  });

  it("says which admin filled a link in, by email, and when", () => {
    expect(
      stateTip(
        performance({ state: "manual", manualAt: "2026-11-02T03:00:00.000Z", manualBy: "sinta.admin@tofly.id" }),
        "Rani",
      ),
    ).toBe("Diisi sinta.admin@tofly.id · 2 Nov 2026, 10.00 WIB.");
  });

  it("says an admin filled a link in when no account is named", () => {
    expect(
      stateTip(performance({ state: "manual", manualAt: "2026-11-02T03:00:00.000Z", manualBy: null }), "Rani"),
    ).toBe("Diisi Admin · 2 Nov 2026, 10.00 WIB.");
  });

  it("names the creator who has not connected the account", () => {
    expect(stateTip(performance({ state: "not_connected" }), "Rani")).toBe(
      "Rani belum menghubungkan akun ini.",
    );
  });

  it.each([
    ["waiting", "Platform belum mengirim angka. Data Instagram bisa telat sampai 48 jam."],
    [
      "not_found",
      "Link tidak cocok dengan video di akun yang terhubung, atau videonya sudah dihapus/diprivate. Angka terakhir tetap disimpan.",
    ],
    [
      "sync_failed",
      "Platform mengembalikan error. Angka terakhir tetap disimpan dan dicoba lagi di sync berikutnya.",
    ],
  ] as const)("explains %s", (state, tip) => {
    expect(stateTip(performance({ state }), "Rani")).toBe(tip);
  });
});

describe("canEnterManually (AC 14)", () => {
  it.each([
    ["not_connected", true],
    ["not_found", true],
    ["sync_failed", true],
    ["manual", true],
    // Still waiting for its first numbers: an admin may type them rather than wait.
    ["waiting", true],
    ["synced", false],
  ] as const)("%s → %s", (state, allowed) => {
    expect(canEnterManually(state)).toBe(allowed);
  });
});

describe("checkManualInput (AC 15)", () => {
  it("reads the typed digits as numbers and an empty field as no data", () => {
    expect(checkManualInput({ views: "12400", likes: " 830 ", comments: "", shares: "0" })).toEqual({
      values: { views: 12400, likes: 830, comments: null, shares: 0 },
      errors: {},
    });
  });

  it("reads digits grouped by thousands, as the field shows them", () => {
    expect(
      checkManualInput({ views: "12.400", likes: "999.999.999", comments: "", shares: "" }).values,
    ).toEqual({ views: 12400, likes: 999_999_999, comments: null, shares: null });
  });

  it.each(["1000000000", "1.000.000.000", "-1", "1.5", "12.40", "banyak", "1e3"])(
    "refuses %s with the same words as the API",
    (typed) => {
      expect(checkManualInput({ views: typed, likes: "", comments: "", shares: "" }).errors).toEqual({
        views: "Isi bilangan bulat 0 sampai 999.999.999",
      });
    },
  );

  it("accepts the highest number", () => {
    expect(
      checkManualInput({ views: "999999999", likes: "", comments: "", shares: "" }).values.views,
    ).toBe(999_999_999);
  });

  it("asks for at least one number when none is filled", () => {
    expect(checkManualInput({ views: "", likes: " ", comments: "", shares: "" }).errors).toEqual({
      metrics: "Isi minimal satu angka",
    });
  });
});
