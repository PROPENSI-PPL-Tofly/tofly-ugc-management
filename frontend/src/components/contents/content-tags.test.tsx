import { render, screen, within } from "@testing-library/react";
import { ContentTags } from "./content-tags";

describe("ContentTags", () => {
  it("renders nothing when the content carries no tag", () => {
    const { container } = render(<ContentTags tags={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("lists each tag by its label, in the order given", () => {
    render(<ContentTags tags={["overdue", "approval_bypassed"]} />);

    const list = screen.getByRole("list", { name: "Tanda konten" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Overdue", "Approval di-bypass"]);
  });

  it("names each tag in text and tints it by its tone, so colour is never the only signal", () => {
    render(<ContentTags tags={["overdue", "approval_bypassed"]} />);

    expect(screen.getByText("Overdue")).toHaveClass("text-red-ink");
    expect(screen.getByText("Approval di-bypass")).toHaveClass("text-amber-ink");
  });

  it("tells a late submission from an overdue one by an outlined, softer red badge", () => {
    render(<ContentTags tags={["overdue", "late_submission"]} />);

    expect(screen.getByText("Overdue")).toHaveClass("bg-red-wash");
    expect(screen.getByText("Late Submission")).toHaveClass("border", "bg-surface", "text-red-ink");
  });

  it("wraps onto further lines instead of widening a narrow cell", () => {
    render(<ContentTags tags={["overdue", "approval_bypassed"]} />);

    expect(screen.getByRole("list", { name: "Tanda konten" })).toHaveClass("flex-wrap", "min-w-0");
  });
});
