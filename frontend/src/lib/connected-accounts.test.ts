import {
  DISCONNECT_WARNING,
  MY_SOCIAL_ACCOUNTS_PATH,
  PERFORMANCE_PATH,
  connectErrorMessage,
  connectHref,
  accountDetail,
  connectedToast,
  disconnectedToast,
  readConnectOutcome,
  toConnectedAccounts,
  type ConnectError,
} from "./connected-accounts";
import { SOCIAL_PLATFORMS } from "./social-connection";

describe("toConnectedAccounts", () => {
  it("reads both platforms from GET /me/social-accounts, Instagram first", () => {
    expect(
      toConnectedAccounts({
        accounts: [
          {
            platform: "tiktok",
            connected: true,
            username: "satrialeka",
            connectedAt: "2026-10-29T17:06:15.305Z",
            lastSyncAt: "2026-10-30T19:00:00.000Z",
          },
          { platform: "instagram", connected: false, username: "rangga.creates", connectedAt: null },
        ],
      }),
    ).toEqual([
      {
        platform: "instagram",
        hasAccount: true,
        connected: false,
        username: "rangga.creates",
        connectedAt: null,
        lastSyncAt: null,
      },
      {
        platform: "tiktok",
        hasAccount: true,
        connected: true,
        username: "satrialeka",
        connectedAt: "2026-10-29T17:06:15.305Z",
        lastSyncAt: "2026-10-30T19:00:00.000Z",
      },
    ]);
  });

  // Sprint 3 prototype: a platform the creator has no account for (none typed at Tambah Creator)
  // is a state of its own, "Tidak ada akun", which nothing can connect.
  it("marks a platform the answer leaves out as having no account", () => {
    expect(
      toConnectedAccounts({
        accounts: [{ platform: "tiktok", connected: true, username: "satrialeka", connectedAt: null }],
      })[0],
    ).toEqual({
      platform: "instagram",
      hasAccount: false,
      connected: false,
      username: null,
      connectedAt: null,
      lastSyncAt: null,
    });
  });

  it("always answers both rows in the order the panel shows them", () => {
    expect(toConnectedAccounts({ accounts: [] }).map((row) => row.platform)).toEqual(SOCIAL_PLATFORMS);
  });

  // The answer is untrusted: anything malformed reads as not connected rather than breaking the
  // page or claiming a connection (OWASP A10:2025).
  describe("an answer it cannot trust", () => {
    it.each([
      ["null", null],
      ["an array", []],
      ["no accounts list", {}],
      ["accounts that is not a list", { accounts: "tiktok" }],
    ])("reads %s as nothing connected", (_label, raw) => {
      expect(toConnectedAccounts(raw).every((row) => !row.connected)).toBe(true);
    });

    it("counts only an explicit true as connected", () => {
      const [, tiktok] = toConnectedAccounts({
        accounts: [{ platform: "tiktok", connected: "true", username: "x", connectedAt: null }],
      });

      expect(tiktok.connected).toBe(false);
    });

    it("skips entries for a platform the panel does not have, and entries that are not objects", () => {
      expect(
        toConnectedAccounts({
          accounts: [null, "x", { platform: "facebook", connected: true, username: "f", connectedAt: null }],
        }).map((row) => row.hasAccount),
      ).toEqual([false, false]);
    });

    it("keeps the first entry when a platform comes twice", () => {
      const [instagram] = toConnectedAccounts({
        accounts: [
          { platform: "instagram", connected: true, username: "first", connectedAt: null },
          { platform: "instagram", connected: false, username: "second", connectedAt: null },
        ],
      });

      expect(instagram.username).toBe("first");
    });

    it.each([
      ["not text", 42],
      ["empty", ""],
    ])("drops a username that is %s", (_label, username) => {
      const [instagram] = toConnectedAccounts({
        accounts: [{ platform: "instagram", connected: true, username, connectedAt: null }],
      });

      expect(instagram.username).toBeNull();
    });

    it("drops a connection date that is not a date", () => {
      const [, tiktok] = toConnectedAccounts({
        accounts: [{ platform: "tiktok", connected: true, username: "s", connectedAt: "kemarin" }],
      });

      expect(tiktok.connectedAt).toBeNull();
    });

    it.each([
      ["not a date", "semalam"],
      ["not text", 1730000000],
    ])("drops a last sync that is %s", (_label, lastSyncAt) => {
      const [, tiktok] = toConnectedAccounts({
        accounts: [{ platform: "tiktok", connected: true, username: "s", connectedAt: null, lastSyncAt }],
      });

      expect(tiktok.lastSyncAt).toBeNull();
    });
  });
});

describe("connectHref", () => {
  it("starts the platform's connect through the backend proxy", () => {
    expect(connectHref("instagram")).toBe("/api/social/instagram/connect");
    expect(connectHref("tiktok")).toBe("/api/social/tiktok/connect");
  });

  it("names the paths the page and its loader use", () => {
    expect(PERFORMANCE_PATH).toBe("/creator/performance");
    expect(MY_SOCIAL_ACCOUNTS_PATH).toBe("/me/social-accounts");
  });
});

describe("readConnectOutcome", () => {
  it("is nothing on a plain visit", () => {
    expect(readConnectOutcome({})).toBeNull();
  });

  // The two connect flows (19.1 and 19.2) were built apart and say "connected" two ways; the
  // page reads both until the team settles on one.
  it.each([
    ["the platform as the value (19.2)", { connected: "tiktok" }, "tiktok"],
    ["a flag beside the platform (19.1)", { platform: "instagram", connected: "1" }, "instagram"],
  ])("reads a connect that worked from %s", (_label, params, platform) => {
    expect(readConnectOutcome(params)).toEqual({ kind: "connected", platform });
  });

  it.each([
    "cancelled",
    "not_professional",
    "not_tester",
    "account_taken",
    "platform_error",
    "connect_failed",
  ] as const)("reads the %s error with its platform", (error) => {
    expect(readConnectOutcome({ platform: "tiktok", error })).toEqual({
      kind: "failed",
      platform: "tiktok",
      error,
    });
  });

  it("reads an error code it does not know as a platform error", () => {
    expect(readConnectOutcome({ platform: "instagram", error: "something_new" })).toEqual({
      kind: "failed",
      platform: "instagram",
      error: "platform_error",
    });
  });

  // Anything the URL carries is the visitor's to edit, so only known platforms are acted on.
  it.each([
    ["an unknown platform", { connected: "facebook" }],
    ["a flag without a platform", { connected: "1" }],
    ["a flag beside an unknown platform", { platform: "myspace", connected: "1" }],
    ["an error without a platform", { error: "cancelled" }],
    ["an error for an unknown platform", { platform: "facebook", error: "cancelled" }],
    ["a repeated value", { connected: ["tiktok", "instagram"] }],
    ["a repeated error", { platform: "tiktok", error: ["cancelled", "not_tester"] }],
    ["an inherited key as the platform", { connected: "__proto__" }],
  ])("ignores %s", (_label, params) => {
    expect(readConnectOutcome(params)).toBeNull();
  });

  // Equivalence classes of the success flag: only "1" means connected.
  it.each(["0", "true", "yes", ""])("ignores the flag %j beside a known platform", (connected) => {
    expect(readConnectOutcome({ platform: "tiktok", connected })).toBeNull();
  });

  // Platform names are matched exactly, as the connect flows send them.
  it.each([
    ["a capitalised platform as the value", { connected: "TikTok" }],
    ["a capitalised platform beside an error", { platform: "TikTok", error: "cancelled" }],
    ["a padded platform", { connected: " tiktok" }],
  ])("ignores %s", (_label, params) => {
    expect(readConnectOutcome(params)).toBeNull();
  });

  // An error the platform named with nothing is still an error: the creator is told to try again.
  it("reads an empty error as a platform error", () => {
    expect(readConnectOutcome({ platform: "tiktok", error: "" })).toEqual({
      kind: "failed",
      platform: "tiktok",
      error: "platform_error",
    });
  });

  it("reads success before an error when both are present", () => {
    expect(readConnectOutcome({ connected: "tiktok", platform: "tiktok", error: "cancelled" })).toEqual({
      kind: "connected",
      platform: "tiktok",
    });
  });
});

describe("the words on the page", () => {
  it("names the platform in the success toast, as PRD 19 words it", () => {
    expect(connectedToast("instagram")).toBe("Akun Instagram berhasil terhubung");
    expect(connectedToast("tiktok")).toBe("Akun TikTok berhasil terhubung");
  });

  it.each<[ConnectError, string]>([
    ["cancelled", "Koneksi dibatalkan"],
    ["not_professional", "Akun Instagram harus akun Professional (Business atau Creator)"],
    ["not_tester", "Akun ini belum didaftarkan sebagai tester. Hubungi Admin Tofly."],
    ["account_taken", "Akun ini sudah terhubung ke creator lain."],
    ["platform_error", "Instagram sedang bermasalah. Coba lagi nanti."],
    // Reviews on #129: PRD 19 and the prototype give no words of their own for this code, so it
    // reads as the platform error until the PO (Kania) words it; the code itself stays.
    ["connect_failed", "Instagram sedang bermasalah. Coba lagi nanti."],
  ])("words %s as the PRD does", (error, message) => {
    expect(connectErrorMessage("instagram", error)).toBe(message);
  });

  it("names TikTok when TikTok is the one in trouble", () => {
    expect(connectErrorMessage("tiktok", "platform_error")).toBe("TikTok sedang bermasalah. Coba lagi nanti.");
  });

  // Sprint 3 prototype (review #129): "Akun TikTok diputuskan.", with its full stop.
  it("confirms a disconnect by platform, worded as the prototype", () => {
    expect(disconnectedToast("tiktok")).toBe("Akun TikTok diputuskan.");
  });

  it("warns, before disconnecting, that the numbers stay but stop updating", () => {
    expect(DISCONNECT_WARNING).toBe("Data performa yang sudah ada tetap disimpan, tapi tidak akan diperbarui lagi.");
  });
});

// The line under each platform's name, worded as the Sprint 3 prototype.
describe("accountDetail", () => {
  const CONNECTED = {
    platform: "tiktok" as const,
    hasAccount: true,
    connected: true,
    username: "satrialeka",
    connectedAt: "2026-10-29T17:06:15.305Z",
    lastSyncAt: null,
  };

  it("names the handle, the Jakarta day it connected and the last sync", () => {
    expect(accountDetail({ ...CONNECTED, lastSyncAt: "2026-10-30T19:00:00.000Z" })).toBe(
      "@satrialeka · terhubung sejak 30 Okt 2026 · sinkron terakhir 31 Okt 2026, 02.00 WIB",
    );
  });

  // PBI-27 has not synced anything yet, so the last sync reads as a dash, as on the admin badges.
  it("shows a dash for a last sync that has not happened", () => {
    expect(accountDetail(CONNECTED)).toBe("@satrialeka · terhubung sejak 30 Okt 2026 · sinkron terakhir —");
  });

  // Boundary value analysis on Jakarta's midnight (17:00 UTC): the last instant of one day and
  // the first of the next.
  it.each([
    ["2026-10-29T16:59:59.999Z", "terhubung sejak 29 Okt 2026"],
    ["2026-10-29T17:00:00.000Z", "terhubung sejak 30 Okt 2026"],
  ])("names %s as Jakarta's day: %s", (connectedAt, words) => {
    expect(accountDetail({ ...CONNECTED, connectedAt })).toContain(words);
  });

  it("leaves out what the backend did not send", () => {
    expect(accountDetail({ ...CONNECTED, username: null, connectedAt: null })).toBe(
      "terhubung · sinkron terakhir —",
    );
  });

  it("names only the handle while the account is not connected", () => {
    expect(accountDetail({ ...CONNECTED, connected: false, username: "rangga.creates" })).toBe("@rangga.creates");
  });

  it("says nothing under an account not connected whose handle is unknown", () => {
    expect(accountDetail({ ...CONNECTED, connected: false, username: null })).toBe("");
  });

  it("asks for the Admin when the creator has no account on the platform", () => {
    expect(accountDetail({ ...CONNECTED, hasAccount: false, connected: false, username: null })).toBe(
      "Belum ada akun TikTok di data kamu. Minta Admin menambahkannya dulu.",
    );
  });
});
