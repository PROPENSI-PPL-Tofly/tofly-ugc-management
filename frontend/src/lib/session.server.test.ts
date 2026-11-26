import { cookies } from "next/headers";
import { currentRole, currentSession } from "./session.server";

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

describe("currentSession", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads a Super Admin from the backend's answer", async () => {
    browserHasSession();
    backendAnswers(200, { role: "admin", adminRole: "super_admin" });

    await expect(currentSession()).resolves.toEqual({ role: "admin", isSuperAdmin: true });
  });

  // OWASP A01:2025: anything but the exact role reads as no Super Admin access.
  it.each([
    ["a regular Admin", { role: "admin", adminRole: "admin" }],
    ["an answer from before adminRole existed", { role: "admin" }],
    ["an unknown role", { role: "admin", adminRole: "SUPER_ADMIN" }],
  ])("gives no Super Admin access to %s", async (_label, body) => {
    browserHasSession();
    backendAnswers(200, body);

    await expect(currentSession()).resolves.toEqual({ role: "admin", isSuperAdmin: false });
  });

  it("never reads a creator as a Super Admin", async () => {
    browserHasSession();
    backendAnswers(200, { role: "creator", adminRole: "super_admin" });

    await expect(currentSession()).resolves.toEqual({ role: "creator", isSuperAdmin: false });
  });

  it("reads no session as nobody signed in", async () => {
    await expect(currentSession()).resolves.toBeNull();
  });
});

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
