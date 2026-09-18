import { redirect } from "next/navigation";
import Home from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("Home page", () => {
  it("sends the visitor to the creator database", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/admin/creators");
  });
});
