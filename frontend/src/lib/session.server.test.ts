import { cookies } from "next/headers";
import { currentRole, isSuperAdmin } from "./session.server";

vi.mock("next/headers", () => ({
  // No session unless a test says otherwise.
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}));

function browserHasSession() {
  vi.mocked(cookies).mockResolvedValueOnce({
    getAll: () => [{ name: "__session", value: "opaque-session-id" }],
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function backendAnswers(status: number, body: unknown = {}) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("currentRole", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["admin", "creator"] as const)(
    "reads the signed-in %s from the backend, forwarding only the session cookie",
    async (role) => {
      browserHasSession();
      const fetchSpy = backendAnswers(200, { role });

      await expect(currentRole()).resolves.toBe(role);

      expect(fetchSpy).toHaveBeenCalledWith("http://backend:3001/auth/session", {
        cache: "no-store",
        headers: { cookie: "__session=opaque-session-id" },
      });
    },
  );

  it("is nobody without asking the backend when the browser has no session cookie", async () => {
    const fetchSpy = backendAnswers(200, { role: "admin" });

    await expect(currentRole()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is nobody when the backend refuses the session", async () => {
    browserHasSession();
    backendAnswers(401, { code: "UNAUTHENTICATED" });

    await expect(currentRole()).resolves.toBeNull();
  });

  it.each([
    ["a server error", 500, {}],
    ["a role it does not know", 200, { role: "owner" }],
  ])("fails loudly on %s rather than guessing", async (_label, status, body) => {
    browserHasSession();
    backendAnswers(status, body);

    await expect(currentRole()).rejects.toThrow();
  });

  it("refuses to guess the backend address", async () => {
    vi.stubEnv("BACKEND_URL", "");
    browserHasSession();

    await expect(currentRole()).rejects.toThrow("BACKEND_URL is not configured");
  });
});

describe("isSuperAdmin", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("is true only for an Admin the session names a Super Admin (PBI-23 AC)", async () => {
    browserHasSession();
    backendAnswers(200, { role: "admin", adminRole: "super_admin" });

    await expect(isSuperAdmin()).resolves.toBe(true);
  });

  it.each([
    ["an Admin", 200, { role: "admin", adminRole: "admin" }],
    ["an Admin from before roles existed", 200, { role: "admin" }],
    ["a creator", 200, { role: "creator", adminRole: "super_admin" }],
    ["a refused session", 401, {}],
    ["a server error", 500, {}],
  ])("is false for %s, so the setting stays hidden", async (_label, status, body) => {
    browserHasSession();
    backendAnswers(status, body);

    await expect(isSuperAdmin()).resolves.toBe(false);
  });

  it("is false without asking the backend when there is no session", async () => {
    const fetchSpy = backendAnswers(200, { role: "admin", adminRole: "super_admin" });

    await expect(isSuperAdmin()).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
