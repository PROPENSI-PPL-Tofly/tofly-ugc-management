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

  // The prototype opens the panel from anywhere on the row; the button stays for the keyboard.
  describe("opening from the row", () => {
    it("opens the content from a press anywhere on its row", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByText("Video Review Kopi"));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
    });

    it("opens it once, not twice, when the press lands on the row's button", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByRole("button", { name: "Tinjau Video Review Kopi" }));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
    });

    it("opens the row that was pressed, among several", () => {
      const { onOpen } = renderTable([ROW, { ...ROW, contentId: "c-2", name: "Unboxing Paket" }]);

      fireEvent.click(screen.getByText("Unboxing Paket"));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-2");
    });

    it("shows a row as something to press", () => {
      renderTable();

      expect(screen.getByText("Video Review Kopi").closest("tr")).toHaveClass(
        "cursor-pointer",
        "hover:bg-surface-2",
      );
    });

    // Dragging across a name to copy it ends in a click on the row. That is copying, not
    // opening.
    describe("when the press ends a text selection", () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("does not open the panel over the text just selected", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
          toString: () => "Video Review",
        } as Selection);
        const { onOpen } = renderTable();

        fireEvent.click(screen.getByText("Video Review Kopi"));

        expect(onOpen).not.toHaveBeenCalled();
      });

      it("still opens from the button, which is never part of a selection", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
          toString: () => "Video Review",
        } as Selection);
        const { onOpen } = renderTable();

        fireEvent.click(screen.getByRole("button", { name: "Tinjau Video Review Kopi" }));

        expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
      });

      it("opens as usual where the browser reports no selection at all", () => {
        vi.spyOn(window, "getSelection").mockReturnValue(null);
        const { onOpen } = renderTable();

        fireEvent.click(screen.getByText("Video Review Kopi"));

        expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
      });
    });

    it("leaves the heading row alone", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByText("Nama Konten"));

      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  // In the prototype a creator's name leads to that creator's own Content Plan.
  describe("the creator's name", () => {
    it("links to that creator's own Content Plan", () => {
      renderTable();

      expect(screen.getByRole("link", { name: "Salsa" })).toHaveAttribute(
        "href",
        "/admin/creators/id-1/content-plan",
      );
    });

    it("links each row to its own creator", () => {
      renderTable([ROW, { ...ROW, contentId: "c-2", creatorId: "id-2", creatorName: "Rangga" }]);

      expect(screen.getByRole("link", { name: "Rangga" })).toHaveAttribute(
        "href",
        "/admin/creators/id-2/content-plan",
      );
    });

    it("keeps an id with a slash in it inside its own part of the address", () => {
      renderTable([{ ...ROW, creatorId: "a/b" }]);

      expect(screen.getByRole("link", { name: "Salsa" })).toHaveAttribute(
        "href",
        "/admin/creators/a%2Fb/content-plan",
      );
    });

    it("does not open the detail panel as well when it is pressed", () => {
      const { onOpen } = renderTable();
      const link = screen.getByRole("link", { name: "Salsa" });
      // jsdom cannot follow a link; the press itself is what is under test.
      link.addEventListener("click", (event) => event.preventDefault());

      fireEvent.click(link);

      expect(onOpen).not.toHaveBeenCalled();
    });

    it("reads as a link, underlined", () => {
      renderTable();

      expect(screen.getByRole("link", { name: "Salsa" })).toHaveClass("underline");
    });
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
