import { backendDelete } from "./backend.server";
import { DISCONNECT_REFUSALS, disconnectAccount } from "./connected-account-actions.server";
import { currentRole } from "./session.server";

vi.mock("./backend.server", () => ({ backendDelete: vi.fn() }));
vi.mock("./session.server", () => ({ currentRole: vi.fn() }));

const mockedDelete = vi.mocked(backendDelete);
const asRole = (role: "admin" | "creator" | null) => vi.mocked(currentRole).mockResolvedValue(role);

function answer(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status });
}

describe("disconnectAccount", () => {
  beforeEach(() => {
    vi.mocked(currentRole).mockReset();
    mockedDelete.mockReset();
    asRole("creator");
    mockedDelete.mockResolvedValue(answer(204));
  });

  it("disconnects the platform the creator chose", async () => {
    await expect(disconnectAccount("tiktok")).resolves.toEqual({ ok: true });
    expect(mockedDelete).toHaveBeenCalledWith("/me/social-accounts/tiktok");
  });

  it("reads a 200 as done too", async () => {
    mockedDelete.mockResolvedValue(answer(200, {}));

    await expect(disconnectAccount("instagram")).resolves.toEqual({ ok: true });
  });

  // Disconnecting an account that is already gone ends where the creator wanted.
  it("reads 404 (nothing connected) as done", async () => {
    mockedDelete.mockResolvedValue(answer(404, { code: "NOT_CONNECTED" }));

    await expect(disconnectAccount("tiktok")).resolves.toEqual({ ok: true });
  });

  // OWASP A01:2025: a server action is a public POST endpoint, so what it is sent is checked
  // before anything reaches the backend: only the two platforms, and only a signed-in creator.
  describe("before anything is sent", () => {
    it.each([
      ["another platform", "facebook"],
      ["a path that climbs out", "../invoices"],
      ["an encoded path", "tiktok%2F..%2Fx"],
      ["no text", 42],
      ["nothing", undefined],
    ])("refuses %s", async (_label, platform) => {
      await expect(disconnectAccount(platform)).resolves.toEqual({
        ok: false,
        code: "UNKNOWN_PLATFORM",
        message: DISCONNECT_REFUSALS.GENERIC,
      });
      expect(mockedDelete).not.toHaveBeenCalled();
    });

    it("asks a caller with no session to sign in", async () => {
      asRole(null);

      await expect(disconnectAccount("tiktok")).resolves.toEqual({
        ok: false,
        code: "UNAUTHENTICATED",
        message: DISCONNECT_REFUSALS.UNAUTHENTICATED,
      });
      expect(mockedDelete).not.toHaveBeenCalled();
    });

    it("refuses an admin: a creator's accounts are theirs to disconnect", async () => {
      asRole("admin");

      await expect(disconnectAccount("tiktok")).resolves.toEqual({
        ok: false,
        code: "FORBIDDEN",
        message: DISCONNECT_REFUSALS.FORBIDDEN,
      });
      expect(mockedDelete).not.toHaveBeenCalled();
    });
  });

  describe("when the backend refuses", () => {
    it("asks to sign in again on 401", async () => {
      mockedDelete.mockResolvedValue(answer(401));

      await expect(disconnectAccount("tiktok")).resolves.toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    });

    it("says it is for creators only on 403", async () => {
      mockedDelete.mockResolvedValue(answer(403));

      await expect(disconnectAccount("tiktok")).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    });

    // OWASP A10:2025: nothing of the server's insides reaches the browser.
    it.each([400, 409, 500, 503])("gives the generic answer on %i, never the backend's own words", async (status) => {
      mockedDelete.mockResolvedValue(answer(status, { code: "X", message: "stack trace at line 3" }));

      await expect(disconnectAccount("tiktok")).resolves.toEqual({
        ok: false,
        code: `HTTP_${status}`,
        message: DISCONNECT_REFUSALS.GENERIC,
      });
    });

    it("gives the generic answer when the backend cannot be reached", async () => {
      mockedDelete.mockRejectedValue(new TypeError("fetch failed"));

      await expect(disconnectAccount("tiktok")).resolves.toEqual({
        ok: false,
        code: "UNAVAILABLE",
        message: DISCONNECT_REFUSALS.GENERIC,
      });
    });

    it("gives the generic answer when the session cannot be read", async () => {
      vi.mocked(currentRole).mockRejectedValue(new Error("Reading the session failed with HTTP 500"));

      await expect(disconnectAccount("tiktok")).resolves.toMatchObject({ ok: false, code: "UNAVAILABLE" });
      expect(mockedDelete).not.toHaveBeenCalled();
    });
  });

  it("words each refusal for the creator", () => {
    expect(DISCONNECT_REFUSALS).toEqual({
      GENERIC: "Koneksi tidak bisa diputuskan. Coba lagi.",
      UNAUTHENTICATED: "Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.",
      FORBIDDEN: "Halaman ini hanya untuk Creator",
    });
  });
});
