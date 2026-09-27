import { redirect } from "next/navigation";
import { currentRole } from "@/lib/session.server";
import Home from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ currentRole: vi.fn() }));

describe("Home page", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  // TC-09-01: opening Tofly's address signed out lands on the login page.
  it.each([
    ["a visitor who is not signed in", null, "/login"],
    ["an admin", "admin", "/admin/creators"],
    ["a creator", "creator", "/creator/tasks"],
  ] as const)("sends %s to their page", async (_label, role, path) => {
    vi.mocked(currentRole).mockResolvedValue(role);

    await Home();

    expect(redirect).toHaveBeenCalledWith(path);
  });
});
