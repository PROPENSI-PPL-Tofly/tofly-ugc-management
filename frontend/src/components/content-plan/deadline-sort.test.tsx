import { fireEvent, render, screen } from "@testing-library/react";
import { DeadlineSortTh } from "./deadline-sort";

describe("DeadlineSortTh", () => {
  it("announces the direction the deadline is sorted in", () => {
    const { rerender } = render(<DeadlineSortTh sort="asc" onToggle={vi.fn()} />);
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");

    rerender(<DeadlineSortTh sort="desc" onToggle={vi.fn()} />);
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
  });

  it("describes the farthest-first order it is showing", () => {
    render(<DeadlineSortTh sort="desc" onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Deadline/ })).toHaveAttribute(
      "title",
      "Terjauh dulu",
    );
  });

  it("describes the nearest-first order it is showing", () => {
    render(<DeadlineSortTh sort="asc" onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Deadline/ })).toHaveAttribute(
      "title",
      "Terdekat dulu",
    );
  });

  it("hands the press back so the page can turn the direction over", () => {
    const onToggle = vi.fn();
    render(<DeadlineSortTh sort="asc" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
