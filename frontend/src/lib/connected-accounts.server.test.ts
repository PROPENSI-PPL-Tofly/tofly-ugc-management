import { backendGet } from "./backend.server";
import { ConnectedAccountsError } from "./connected-accounts";
import { fetchMyConnectedAccounts } from "./connected-accounts.server";

vi.mock("./backend.server", () => ({ backendGet: vi.fn() }));

const mockedGet = vi.mocked(backendGet);

function answer(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

describe("fetchMyConnectedAccounts", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  // OWASP A01:2025: the request names nobody; whose accounts these are comes from the session.
  it("asks for the signed-in creator's own accounts, naming no creator", async () => {
    mockedGet.mockResolvedValue(answer({ accounts: [] }));

    await fetchMyConnectedAccounts();

    expect(mockedGet).toHaveBeenCalledWith("/me/social-accounts");
  });

  it("reads the answer into the panel's two rows", async () => {
    mockedGet.mockResolvedValue(
      answer({
        accounts: [{ platform: "tiktok", connected: true, username: "satrialeka", connectedAt: "2026-10-29T17:06:15.305Z" }],
      }),
    );

    await expect(fetchMyConnectedAccounts()).resolves.toEqual([
      { platform: "instagram", connected: false, username: null, connectedAt: null },
      { platform: "tiktok", connected: true, username: "satrialeka", connectedAt: "2026-10-29T17:06:15.305Z" },
    ]);
  });

  // A failed load must never look like "nothing connected", so it throws with its status and
  // the page can tell a signed-out creator from a backend that failed.
  it.each([401, 403, 404, 500, 503])("throws with the status when the backend answers %i", async (status) => {
    mockedGet.mockResolvedValue(answer({ code: "X" }, status));

    const error = await fetchMyConnectedAccounts().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ConnectedAccountsError);
    expect((error as ConnectedAccountsError).status).toBe(status);
  });

  it("throws as unusable (502) when a 200 carries no JSON", async () => {
    mockedGet.mockResolvedValue(answer("<html>oops</html>"));

    await expect(fetchMyConnectedAccounts()).rejects.toMatchObject({ status: 502 });
  });

  it("passes on a backend that cannot be reached", async () => {
    const failure = new TypeError("fetch failed");
    mockedGet.mockRejectedValue(failure);

    await expect(fetchMyConnectedAccounts()).rejects.toBe(failure);
  });
});

describe("ConnectedAccountsError", () => {
  it("names the failed load and keeps its status", () => {
    const error = new ConnectedAccountsError(500);

    expect(error.name).toBe("ConnectedAccountsError");
    expect(error.status).toBe(500);
    expect(error.message).toBe("Loading your connected accounts failed with HTTP 500");
  });
});
