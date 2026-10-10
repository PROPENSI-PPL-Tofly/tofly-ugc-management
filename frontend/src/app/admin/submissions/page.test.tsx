import { permanentRedirect } from "next/navigation";
import SubmissionsPage from "./page";

vi.mock("next/navigation", () => ({
  permanentRedirect: vi.fn(),
}));

describe("Submissions page", () => {
  it("sends the old draft-queue address to the Content Plan's approval tab", () => {
    SubmissionsPage();

    expect(permanentRedirect).toHaveBeenCalledWith("/admin/content-plan?tab=action");
  });
});
