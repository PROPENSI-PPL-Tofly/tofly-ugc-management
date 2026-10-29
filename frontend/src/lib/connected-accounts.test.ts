import {
  CONNECT_PLATFORMS,
  DISCONNECT_WARNING,
  MY_SOCIAL_ACCOUNTS_PATH,
  PERFORMANCE_PATH,
  connectErrorMessage,
  connectHref,
  connectedSince,
  connectedToast,
  disconnectedToast,
  readConnectOutcome,
  toConnectedAccounts,
  type ConnectError,
} from "./connected-accounts";

describe("toConnectedAccounts", () => {
  it("reads both platforms from GET /me/social-accounts, Instagram first", () => {
    expect(
      toConnectedAccounts({
        accounts: [
          { platform: "tiktok", connected: true, username: "satrialeka", connectedAt: "2026-10-29T17:06:15.305Z" },
          { platform: "instagram", connected: false, username: "rangga.creates", connectedAt: null },
        ],
      }),
    ).toEqual([
      { platform: "instagram", connected: false, username: "rangga.creates", connectedAt: null },
      { platform: "tiktok", connected: true, username: "satrialeka", connectedAt: "2026-10-29T17:06:15.305Z" },
    ]);
  });

  it("gives a platform the answer leaves out a row that is not connected", () => {
    expect(
      toConnectedAccounts({
        accounts: [{ platform: "tiktok", connected: true, username: "satrialeka", connectedAt: null }],
      })[0],
    ).toEqual({ platform: "instagram", connected: false, username: null, connectedAt: null });
  });

  it("always answers both rows in the order the panel shows them", () => {
    expect(toConnectedAccounts({ accounts: [] }).map((row) => row.platform)).toEqual(CONNECT_PLATFORMS);
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
        }),
      ).toEqual([
        { platform: "instagram", connected: false, username: null, connectedAt: null },
        { platform: "tiktok", connected: false, username: null, connectedAt: null },
      ]);
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
    ["connect_failed", "Koneksi tidak bisa diselesaikan. Coba lagi."],
  ])("words %s as the PRD does", (error, message) => {
    expect(connectErrorMessage("instagram", error)).toBe(message);
  });

  it("names TikTok when TikTok is the one in trouble", () => {
    expect(connectErrorMessage("tiktok", "platform_error")).toBe("TikTok sedang bermasalah. Coba lagi nanti.");
  });

  it("confirms a disconnect by platform", () => {
    expect(disconnectedToast("tiktok")).toBe("Akun TikTok diputuskan");
  });

  it("warns, before disconnecting, that the numbers stay but stop updating", () => {
    expect(DISCONNECT_WARNING).toBe("Data performa yang sudah ada tetap disimpan, tapi tidak akan diperbarui lagi.");
  });
});

describe("connectedSince", () => {
  it("names the Jakarta day the account was connected", () => {
    expect(connectedSince("2026-10-29T17:06:15.305Z")).toBe("Terhubung sejak 30 Okt 2026");
  });

  it("leaves the day out when there is none", () => {
    expect(connectedSince(null)).toBe("Terhubung");
  });
});
