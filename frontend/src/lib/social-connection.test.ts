import {
  connectionLabel,
  connectionTooltip,
  isUsernameLocked,
  NOT_CONNECTED,
  readConnections,
  type SocialConnection,
} from "./social-connection";

const CONNECTED: SocialConnection = {
  connected: true,
  // 17.00 WIB on 29 Oct.
  connectedAt: "2026-10-29T10:00:00Z",
  lastSyncAt: null,
};

describe("readConnections", () => {
  it("reads each platform's connection as 19.3 sends it", () => {
    expect(
      readConnections({
        instagram: {
          connected: true,
          connectedAt: "2026-10-29T10:00:00Z",
          lastSyncAt: "2026-10-29T19:00:00Z",
        },
        tiktok: { connected: false, connectedAt: null, lastSyncAt: null },
      }),
    ).toEqual({
      instagram: {
        connected: true,
        connectedAt: "2026-10-29T10:00:00Z",
        lastSyncAt: "2026-10-29T19:00:00Z",
      },
      tiktok: NOT_CONNECTED,
    });
  });

  it("reads every platform as not connected while the backend sends nothing (19.3 not merged)", () => {
    expect(readConnections(undefined)).toEqual({
      instagram: NOT_CONNECTED,
      tiktok: NOT_CONNECTED,
    });
  });

  it.each([
    ["null", null],
    ["a string", "connected"],
    ["an array", [{ connected: true }]],
  ])("reads %s as no connections, never failing the page", (_label, raw) => {
    expect(readConnections(raw)).toEqual({
      instagram: NOT_CONNECTED,
      tiktok: NOT_CONNECTED,
    });
  });

  it.each([
    ["connected as text", { connected: "true" }],
    ["connected missing", { connectedAt: "2026-10-29T10:00:00Z" }],
    ["the platform's entry not an object", "yes"],
  ])("counts a platform as not connected when %s", (_label, entry) => {
    expect(readConnections({ instagram: entry }).instagram).toEqual(
      NOT_CONNECTED,
    );
  });

  it("keeps a connection whose dates are not dates, with the dates left out", () => {
    expect(
      readConnections({
        instagram: { connected: true, connectedAt: "kemarin", lastSyncAt: 42 },
      }).instagram,
    ).toEqual({ connected: true, connectedAt: null, lastSyncAt: null });
  });

  it("ignores a platform it does not know", () => {
    expect(
      Object.keys(readConnections({ youtube: { connected: true } })),
    ).toEqual(["instagram", "tiktok"]);
  });
});

describe("connectionLabel", () => {
  it("names a connected account Terhubung", () => {
    expect(connectionLabel(CONNECTED)).toBe("Terhubung");
  });

  it("names any other account Belum terhubung", () => {
    expect(connectionLabel(NOT_CONNECTED)).toBe("Belum terhubung");
  });
});

describe("connectionTooltip", () => {
  it("gives the connection day and a dash until the first sync (PBI-27)", () => {
    expect(connectionTooltip(CONNECTED)).toBe(
      "Terhubung sejak 29 Okt 2026 · sinkron terakhir —.",
    );
  });

  it("gives the last sync time in Jakarta once there is one", () => {
    expect(
      connectionTooltip({ ...CONNECTED, lastSyncAt: "2026-10-29T19:00:00Z" }),
    ).toBe(
      "Terhubung sejak 29 Okt 2026 · sinkron terakhir 30 Okt 2026, 02.00 WIB.",
    );
  });

  it("counts the connection day in Jakarta, not UTC", () => {
    // 23.30 UTC on 28 Oct is already 29 Oct in Jakarta.
    expect(
      connectionTooltip({ ...CONNECTED, connectedAt: "2026-10-28T23:30:00Z" }),
    ).toBe("Terhubung sejak 29 Okt 2026 · sinkron terakhir —.");
  });

  it("shows a dash for a connection day it was not given", () => {
    expect(connectionTooltip({ ...CONNECTED, connectedAt: null })).toBe(
      "Terhubung sejak — · sinkron terakhir —.",
    );
  });

  it("explains why the numbers are not pulled for an account that is not connected", () => {
    expect(connectionTooltip(NOT_CONNECTED)).toBe(
      "Creator belum menghubungkan akun ini, jadi angka performanya belum bisa ditarik otomatis.",
    );
  });
});

// PBI-19, AC 10: once connected, the username is the platform's and read-only for Admin. The
// form that edits a username is PBI-16's; this is the rule it reads.
describe("isUsernameLocked", () => {
  it("locks the username of a connected account", () => {
    expect(isUsernameLocked(CONNECTED)).toBe(true);
  });

  it("leaves the username of an account that is not connected for Admin to correct", () => {
    expect(isUsernameLocked(NOT_CONNECTED)).toBe(false);
  });

  it("leaves every username open while the backend sends no connections (19.3 not merged)", () => {
    const connections = readConnections(undefined);

    expect(isUsernameLocked(connections.instagram)).toBe(false);
    expect(isUsernameLocked(connections.tiktok)).toBe(false);
  });
});
