import { cookies } from "next/headers";
import { fetchAdminUsers } from "./admin-users.server";

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

const ANSWER = {
  items: [
    {
      id: "7d9f3d1a-0000-4000-8000-000000000001",
      name: "Rangga Pratama",
      email: "rangga@example.com",
      role: "admin",
      isActive: true,
      lastSignInAt: null,
      createdAt: "2026-10-01T02:00:00.000Z",
    },
  ],
  page: 1,
  pageSize: 10,
  total: 1,
};

describe("fetchAdminUsers", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("asks the backend for the page and the search, forwarding only the session cookie", async () => {
    browserHasSession();
    const fetchSpy = backendAnswers(200, ANSWER);

    const outcome = await fetchAdminUsers(2, { q: "rangga pratama" });

    expect(outcome).toEqual({
      kind: "loaded",
      list: { items: expect.any(Array), page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://backend:3001/admin/users?search=rangga+pratama&page=2&pageSize=10",
      {
        cache: "no-store",
        headers: { cookie: "__session=opaque-session-id" },
      },
    );
  });

  // The menu is hidden from an Admin, but a typed address still reaches the page: the backend
  // refuses, and the page says not found rather than drawing an empty list as if there were none.
  it("reads the backend's 403 as a refusal, not as a list", async () => {
    browserHasSession();
    backendAnswers(403, { code: "FORBIDDEN" });

    await expect(fetchAdminUsers(1, { q: "" })).resolves.toEqual({ kind: "refused" });
  });

  it.each([
    ["a server error", () => backendAnswers(500, {})],
    [
      "a network drop",
      () => vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed")),
    ],
    [
      "an answer missing a field",
      () => backendAnswers(200, { items: [{ id: "x" }], page: 1, pageSize: 10, total: 1 }),
    ],
    [
      "a body that is not JSON",
      () =>
        vi
          .spyOn(globalThis, "fetch")
          .mockResolvedValue(new Response("<html>", { status: 200 })),
    ],
  ])("reads %s as unavailable", async (_label, arrange) => {
    browserHasSession();
    arrange();

    await expect(fetchAdminUsers(1, { q: "" })).resolves.toEqual({ kind: "unavailable" });
  });

  it("refuses to guess the backend address", async () => {
    vi.stubEnv("BACKEND_URL", "");
    browserHasSession();

    await expect(fetchAdminUsers(1, { q: "" })).resolves.toEqual({ kind: "unavailable" });
  });
});
