import { currentRole } from "@/lib/session.server";
import { GET } from "./route";

vi.mock("@/lib/session.server", () => ({ currentRole: vi.fn() }));

// Tofly's address has no page of its own: it sends each visitor to where they belong.
describe("Tofly's address", () => {
  // TC-09-01: opening Tofly's address signed out lands on the login page.
  it.each([
    ["a visitor who is not signed in", null, "/login"],
    ["an admin", "admin", "/admin/dashboard"],
    ["a creator", "creator", "/creator/dashboard"],
  ] as const)("sends %s to their page", async (_label, role, path) => {
    vi.mocked(currentRole).mockResolvedValue(role);

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(path);
  });

  // ZAP 10044 (Big Redirect): a page's redirect() answered with a whole HTML document behind the
  // 307. The redirect carries nothing but where to go, and is never cached across visitors.
  it("answers the redirect with an empty body that no cache keeps", async () => {
    vi.mocked(currentRole).mockResolvedValue(null);

    const response = await GET();

    await expect(response.text()).resolves.toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
