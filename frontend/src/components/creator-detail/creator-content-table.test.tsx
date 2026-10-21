import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ContentPlanTab, DeadlineSort } from "@/lib/content-plan";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { CreatorContentTable } from "./creator-content-table";

const ROW: CreatorContentRow = {
  contentId: "c-1",
  name: "Evg_7_RanggaPratama_26092026",
  type: "evergreen",
  deadline: "2026-09-26",
  status: "draft_review",
  tags: [],
  revisionCount: 0,
};

function renderTable(
  rows: CreatorContentRow[] = [ROW],
  {
    filtered = false,
    tab = "all",
    sort = "asc",
  }: { filtered?: boolean; tab?: ContentPlanTab; sort?: DeadlineSort } = {},
) {
  const onOpen = vi.fn();
  const onReset = vi.fn();
  const onSortToggle = vi.fn();
  render(
    <CreatorContentTable
      rows={rows}
      filtered={filtered}
      tab={tab}
      sort={sort}
      onSortToggle={onSortToggle}
      onOpen={onOpen}
      onReset={onReset}
    />,
  );
  return { onOpen, onReset, onSortToggle };
}

/** The table row a content's name sits in. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("CreatorContentTable", () => {
  it("shows the prototype's columns", () => {
    renderTable();

    expect(
      screen.getAllByRole("columnheader").map((heading) => heading.textContent),
    ).toEqual(["Konten", "Deadline↑", "Status", "Aksi"]);
  });

  it("sorts by deadline from its header, as the Content Plan does, and says which way", () => {
    const { onSortToggle } = renderTable([ROW], { sort: "desc" });

    expect(screen.getByRole("columnheader", { name: /Deadline/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    expect(onSortToggle).toHaveBeenCalledOnce();
  });

  it.each([
    ["action", "Tidak ada yang perlu di-approve."],
    ["waiting", "Tidak ada konten yang menunggu kreator."],
    ["done", "Belum ada konten selesai."],
  ] as const)("says the %s tab's own nothing when it is simply empty", (tab, text) => {
    renderTable([], { tab });

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("keeps the action column's heading for screen readers only, as the prototype shows none", () => {
    renderTable();

    expect(screen.getByText("Aksi")).toHaveClass("sr-only");
  });

  it("keeps that hidden heading inside the table's own scroll area, so a phone never scrolls the page sideways", () => {
    renderTable();

    // sr-only is position:absolute. Unless the scroll area is positioned, the heading is laid
    // out against the page and widens it by however far the table overflows (117 px at 375 px).
    const scrollArea = screen.getByText("Aksi").closest(".overflow-x-auto");
    expect(scrollArea).toHaveClass("relative");
  });

  it("fills a row with the content, its type under the name, and its formatted deadline", () => {
    renderTable();

    const row = within(rowOf("Evg_7_RanggaPratama_26092026"));
    expect(row.getByText("Evergreen")).toBeInTheDocument();
    expect(row.getByText("26 Sep 2026")).toBeInTheDocument();
  });

  it.each([
    ["evergreen", "Evergreen"],
    ["specific", "Specific"],
  ] as const)("words a %s content's type", (type, label) => {
    renderTable([{ ...ROW, type }]);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ["pending", "Pending"],
    ["scheduled", "Scheduled"],
    ["draft_review", "Draft Menunggu Review"],
    ["draft_revision", "Draft Perlu Revisi"],
    ["draft_approved", "Draft Approved"],
    ["link_submitted", "Content Link Submitted"],
  ] as const)("words the status %s the way every admin view words it", (status, label) => {
    renderTable([{ ...ROW, status }]);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // A status is a fact, so it reads as a dot beside its words, as Content Plan, Task Saya and
  // Creator Database draw it. The dot takes the colour every admin view gives the status.
  it.each([
    ["pending", "Pending", "bg-accent"],
    ["scheduled", "Scheduled", "bg-rule"],
    ["draft_review", "Draft Menunggu Review", "bg-accent"],
    ["draft_revision", "Draft Perlu Revisi", "bg-amber"],
    ["draft_approved", "Draft Approved", "bg-green"],
    ["link_submitted", "Content Link Submitted", "bg-green"],
  ] as const)("draws the status %s as a dot and its words, not a pill", (status, label, colour) => {
    renderTable([{ ...ROW, status }]);

    const status_ = screen.getByText(label);
    expect(status_).not.toHaveClass("rounded-full");
    expect(status_.querySelector('[aria-hidden="true"]')).toHaveClass(colour);
  });

  it.each([
    ["evergreen", "Evergreen"],
    ["specific", "Specific"],
  ] as const)("writes a %s content's type as quiet text, not a coloured pill", (type, label) => {
    renderTable([{ ...ROW, type }]);

    const typeLabel = screen.getByText(label);
    expect(typeLabel).not.toHaveClass("rounded-full");
    expect(typeLabel).toHaveClass("text-muted");
  });

  it("shows only the Overdue tag beside the status", () => {
    renderTable([{ ...ROW, tags: ["late_submission", "overdue", "approval_bypassed"] }]);

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText("Late Submission")).toBeNull();
    expect(screen.queryByText("Approval di-bypass")).toBeNull();
  });

  it("leaves the revision count to the content's panel", () => {
    renderTable([{ ...ROW, status: "draft_revision", revisionCount: 2 }]);

    expect(screen.queryByText(/Revisi ke-/)).toBeNull();
  });

  it("adds nothing to a row with no tag and no revision", () => {
    renderTable();

    expect(screen.queryByText(/Revisi ke-/)).toBeNull();
    expect(screen.queryByText("Overdue")).toBeNull();
  });

  it("leaves the panel shut when the press ended a drag that selected the name to copy it", () => {
    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Evg_7" } as Selection);
    const { onOpen } = renderTable();

    fireEvent.click(rowOf("Evg_7_RanggaPratama_26092026"));

    expect(onOpen).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("opens a row whose press left no selection to read at all", () => {
    vi.spyOn(window, "getSelection").mockReturnValue(null);
    const { onOpen } = renderTable();

    fireEvent.click(rowOf("Evg_7_RanggaPratama_26092026"));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
    vi.restoreAllMocks();
  });

  it("keeps the rows in the order they were given", () => {
    renderTable([
      { ...ROW, contentId: "c-2", name: "Konten Kedua" },
      { ...ROW, contentId: "c-1", name: "Konten Pertama" },
    ]);

    const [, second, third] = screen.getAllByRole("row");
    expect(second).toHaveTextContent("Konten Kedua");
    expect(third).toHaveTextContent("Konten Pertama");
  });

  describe("opening a content", () => {
    it("opens the row's content on a press anywhere on the row", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByText("26 Sep 2026"));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
    });

    it("opens it once from the button, not once for the button and once for the row", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByRole("button", { name: "Tinjau Evg_7_RanggaPratama_26092026" }));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
    });

    it.each(["pending", "draft_review"] as const)("offers Tinjau for a %s content", (status) => {
      renderTable([{ ...ROW, status }]);

      expect(
        screen.getByRole("button", { name: "Tinjau Evg_7_RanggaPratama_26092026" }),
      ).toHaveTextContent("Tinjau");
    });

    it.each(["scheduled", "draft_revision", "draft_approved", "link_submitted"] as const)(
      "offers no Detail button for a %s content; its name opens it",
      (status) => {
        const { onOpen } = renderTable([{ ...ROW, status }]);

        expect(screen.queryByRole("button", { name: /^Detail/ })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Evg_7_RanggaPratama_26092026" }));
        expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
      },
    );

    it("opens the content that was pressed, among several", () => {
      const { onOpen } = renderTable([ROW, { ...ROW, contentId: "c-2", name: "Konten Kedua" }]);

      fireEvent.click(screen.getByText("Konten Kedua"));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-2");
    });

    it("leaves the heading row alone", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByText("Deadline"));

      expect(onOpen).not.toHaveBeenCalled();
    });

    describe("when the press ends a text selection", () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("does not open the panel over the text just selected", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
          toString: () => "RanggaPratama",
        } as Selection);
        const { onOpen } = renderTable();

        fireEvent.click(screen.getByText("Evg_7_RanggaPratama_26092026"));

        expect(onOpen).not.toHaveBeenCalled();
      });

      it("still opens from the button, which is never part of a selection", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
          toString: () => "RanggaPratama",
        } as Selection);
        const { onOpen } = renderTable();

        fireEvent.click(
          screen.getByRole("button", { name: "Tinjau Evg_7_RanggaPratama_26092026" }),
        );

        expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
      });

      it("opens as usual where the browser reports no selection at all", () => {
        vi.spyOn(window, "getSelection").mockReturnValue(null);
        const { onOpen } = renderTable();

        fireEvent.click(screen.getByText("Evg_7_RanggaPratama_26092026"));

        expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
      });
    });
  });

  describe("with nothing to show", () => {
    it("says the period has no content yet", () => {
      renderTable([]);

      expect(screen.getByText("Belum ada konten pada periode kontrak ini.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).toBeNull();
    });

    it("says nothing matches when a filter hid them all, and how to get them back", () => {
      const { onReset } = renderTable([], { filtered: true });

      expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
      expect(screen.getByText("Longgarkan pencarian atau filternya.")).toBeInTheDocument();
      expect(screen.queryByText("Belum ada konten pada periode kontrak ini.")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  it("shows markup in a content's name as the text it is, never as markup", () => {
    const { container } = render(
      <CreatorContentTable
        rows={[{ ...ROW, name: '<img src=x onerror="alert(1)">' }]}
        filtered={false}
        tab="all"
        sort="asc"
        onSortToggle={vi.fn()}
        onOpen={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
  });
});
