import { render, screen } from "@testing-library/react";
import { parseContentPlanParams } from "@/lib/content-plan";
import { ContentPlanViewToggle } from "./content-plan-view-toggle";

describe("ContentPlanViewToggle", () => {
  it("offers Tabel and Kalender, marking the view on show", () => {
    render(<ContentPlanViewToggle state={parseContentPlanParams({})} />);

    expect(
      screen.getByRole("group", { name: "Tampilan Content Plan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Kalender" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("leads to the other view keeping the tab and filters", () => {
    render(
      <ContentPlanViewToggle
        state={parseContentPlanParams({
          tab: "action",
          creator: "abc",
          page: "3",
        })}
      />,
    );

    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute(
      "href",
      "/admin/content-plan?tab=action&creator=abc&view=calendar",
    );
    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute(
      "href",
      "/admin/content-plan?tab=action&creator=abc",
    );
  });

  it("marks Kalender on the calendar", () => {
    render(
      <ContentPlanViewToggle
        state={parseContentPlanParams({ view: "calendar" })}
      />,
    );

    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
