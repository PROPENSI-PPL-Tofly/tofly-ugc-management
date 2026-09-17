import { redirect } from "next/navigation";
import Home from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("Home", () => {
  it("sends the visitor to the admin area, the only thing this app serves", () => {
    Home();

    expect(redirect).toHaveBeenCalledWith("/admin/creators");
  });
});
