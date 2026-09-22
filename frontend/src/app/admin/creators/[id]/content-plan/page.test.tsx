import { render, screen } from "@testing-library/react";
import ContentPlanPage from "./page";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/creators" }));

async function renderPage(id = "creator-rangga") {
  render(await ContentPlanPage({ params: Promise.resolve({ id }) }));
}

describe("Creator content plan page", () => {
  it("says the screen is not available yet", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Content Plan" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Belum tersedia" })).toBeInTheDocument();
  });

  it("offers a way back to the creator list", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "Kembali ke Creator Database" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
  });
});
