import { render, screen } from "@testing-library/react";
import ContentPlanPage from "./page";

vi.mock("@/components/contents/content-plan-client", () => ({
  ContentPlanClient: ({ creatorId }: { creatorId: string }) => (
      <div data-testid="content-plan-client">
        Content Plan Client — {creatorId}
      </div>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/creators",
}));

async function renderPage(id = "creator-rangga") {
  render(await ContentPlanPage({ params: Promise.resolve({ id }) }));
}

describe("Creator content plan page", () => {
  it("renders the Content Plan heading and description", async () => {
    await renderPage();

    expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Content Plan",
        }),
    ).toBeInTheDocument();

    expect(
        screen.getByText("Kelola jadwal konten creator"),
    ).toBeInTheDocument();
  });

  it("passes the creator id to the Content Plan client", async () => {
    await renderPage("creator-123");

    expect(
        screen.getByTestId("content-plan-client"),
    ).toHaveTextContent("Content Plan Client — creator-123");
  });
});