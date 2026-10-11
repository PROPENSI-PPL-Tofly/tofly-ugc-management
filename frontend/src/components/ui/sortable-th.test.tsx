import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { SortableTh } from "./sortable-th";

const HINTS = { asc: "Terdekat dulu", desc: "Terjauh dulu" };

type Props = ComponentProps<typeof SortableTh>;

/** A header cell is only valid inside a table row, so every test renders one. */
function renderHeader(props: Partial<Props> = {}) {
  const onToggle = props.onToggle ?? vi.fn();
  const utils = render(
    <table>
      <thead>
        <tr>
          <th>Nama Konten</th>
          <SortableTh label="Deadline" direction="desc" hints={HINTS} {...props} onToggle={onToggle} />
        </tr>
      </thead>
    </table>,
  );
  return { ...utils, onToggle };
}

function header() {
  return screen.getByRole("columnheader", { name: /Deadline/ });
}

describe("SortableTh", () => {
  it.each([
    ["asc", "ascending"],
    ["desc", "descending"],
  ] as const)("announces a column sorted %s as %s", (direction, announced) => {
    renderHeader({ direction });

    expect(header()).toHaveAttribute("aria-sort", announced);
  });

  it.each([
    ["asc", "Terdekat dulu", "↑"],
    ["desc", "Terjauh dulu", "↓"],
  ] as const)("says what %s means for this column, and points the arrow", (direction, hint, arrow) => {
    renderHeader({ direction });

    const button = screen.getByRole("button", { name: /Deadline/ });
    expect(button).toHaveAttribute("title", hint);
    expect(button).toHaveTextContent(arrow);
  });

  it("keeps the arrow out of what a screen reader announces, since aria-sort already says it", () => {
    renderHeader({ direction: "asc" });

    expect(screen.getByText("↑")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Deadline" })).toBeInTheDocument();
  });

  it("hands each press back once, so the page can turn the direction over", () => {
    const { onToggle } = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("does not turn the direction over by itself: the caller owns it", () => {
    renderHeader({ direction: "desc" });

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(header()).toHaveAttribute("aria-sort", "descending");
  });

  it("is a real button, so Enter and Space work without extra wiring", () => {
    renderHeader();

    const button = screen.getByRole("button", { name: /Deadline/ });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("takes any column's label and wording, not only the deadline's", () => {
    renderHeader({ label: "Nama", hints: { asc: "A ke Z", desc: "Z ke A" }, direction: "asc" });

    const button = screen.getByRole("button", { name: /Nama$/ });
    expect(button).toHaveAttribute("title", "A ke Z");
    expect(screen.getByRole("columnheader", { name: /^Nama$/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("leaves the columns beside it unsorted", () => {
    renderHeader();

    expect(screen.getByRole("columnheader", { name: "Nama Konten" })).not.toHaveAttribute("aria-sort");
  });
});
