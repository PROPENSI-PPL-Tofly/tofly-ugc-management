import { fireEvent, render, screen } from "@testing-library/react";
import type { ContentPlanRow, ContentPlanTab } from "@/lib/content-plan";
import { ContentPlanTable } from "./content-plan-table";

const ROW: ContentPlanRow = {
  contentId: "c-1",
  name: "Video Review Kopi",
  creatorId: "id-1",
  creatorName: "Salsa",
  type: "evergreen",
  deadline: "2026-10-15",
  status: "draft_review",
  tags: [],
  revisionCount: 0,
};

function renderTable(
  rows: ContentPlanRow[] = [ROW],
  { filtered = false, tab = "all" as ContentPlanTab } = {},
) {
  const onOpen = vi.fn();
  const onSortToggle = vi.fn();
  render(
    <ContentPlanTable
      items={rows}
      filtered={filtered}
      tab={tab}
      sort="desc"
      onSortToggle={onSortToggle}
      onOpen={onOpen}
    />,
  );
  return { onOpen, onSortToggle };
}

describe("ContentPlanTable", () => {
  it("shows every column of the plan, deadline included", () => {
    renderTable();
    for (const heading of [
      "Nama Konten",
      "Kreator",
      "Tipe",
      "Deadline",
      "Status",
      "Tags",
      "Aksi",
    ]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(heading) })).toBeInTheDocument();
    }
  });

  it("fills a row with the content, its creator, and its formatted deadline", () => {
    renderTable();
    expect(screen.getByText("Video Review Kopi")).toBeInTheDocument();
    expect(screen.getByText("Salsa")).toBeInTheDocument();
    expect(screen.getByText("Evergreen")).toBeInTheDocument();
    expect(screen.getByText("15 Okt 2026")).toBeInTheDocument();
  });

  it("words the status the way every admin view words it", () => {
    renderTable();
    expect(screen.getByText("Draft Menunggu Review")).toBeInTheDocument();
  });

  it("gives a row awaiting a decision the review button, and the rest the quiet detail one", () => {
    const { onOpen } = renderTable();
    const review = screen.getByRole("button", { name: "Tinjau Video Review Kopi" });
    expect(review).toBeInTheDocument();

    fireEvent.click(review);
    expect(onOpen).toHaveBeenCalledWith("c-1");
  });

  it("keeps the detail button quiet for a row the creator holds", () => {
    renderTable([{ ...ROW, status: "scheduled" }]);
    const detail = screen.getByRole("button", { name: "Detail Video Review Kopi" });
    expect(detail).toBeInTheDocument();
    expect(detail.className).toContain("border-transparent");
  });

  it("reads each tag as a coloured pill beside the status", () => {
    renderTable([{ ...ROW, tags: ["overdue", "approval_bypassed"] }]);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Approval di-bypass")).toBeInTheDocument();
  });

  it("says how many times a piece came back for revision", () => {
    renderTable([{ ...ROW, revisionCount: 2 }]);
    expect(screen.getByText("Revisi ke-2")).toBeInTheDocument();
  });

  it("says the tab's own nothing when the list is simply empty", () => {
    renderTable([], { tab: "action" });
    expect(screen.getByText("Tidak ada yang perlu di-approve.")).toBeInTheDocument();
  });

  it("says the filter found nothing when a filter narrowed the view", () => {
    renderTable([], { filtered: true });
    expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada konten.")).not.toBeInTheDocument();
  });

  it("hands the deadline press back so the page can turn the direction over", () => {
    const { onSortToggle } = renderTable();
    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    expect(onSortToggle).toHaveBeenCalledOnce();
  });
});
