import { fireEvent, render, screen } from "@testing-library/react";
import { MyTaskFilters } from "./my-task-filters";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/tasks",
  useRouter: () => ({ replace }),
}));

describe("MyTaskFilters", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("offers every Task Saya status in the creator's words, after Semua", () => {
    render(<MyTaskFilters status={null} />);

    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual([
      "Semua",
      "Scheduled",
      "Draft Menunggu Review",
      "Draft Perlu Revisi",
      "Draft Approved",
      "Content Link Submitted",
    ]);
  });

  it("shows the status the URL filters by", () => {
    render(<MyTaskFilters status="draft_approved" />);

    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("draft_approved");
  });

  it("shows Semua when nothing is filtered", () => {
    render(<MyTaskFilters status={null} />);

    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("");
  });

  // A new filter starts from its first page: the old page number may not exist any more.
  it("puts the picked status in the URL and drops the page", () => {
    render(<MyTaskFilters status={null} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "draft_revision" },
    });

    expect(replace).toHaveBeenCalledWith("/creator/tasks?status=draft_revision", {
      scroll: false,
    });
  });

  it("clears the filter for Semua", () => {
    render(<MyTaskFilters status="scheduled" />);

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "" },
    });

    expect(replace).toHaveBeenCalledWith("/creator/tasks", { scroll: false });
  });
});
