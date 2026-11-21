import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import type { CreatorContentRow } from "@/lib/creator-detail";
import { CreatorContentTable } from "./creator-content-table";

const ROW: CreatorContentRow = {
  platforms: [],
  contentId: "c-1",
  name: "Evg_7_RanggaPratama_26092026",
  type: "evergreen",
  deadline: "2026-09-26",
  status: "draft_review",
  tags: [],
  revisionCount: 0,
};

function renderTable(rows: CreatorContentRow[] = [ROW], { filtered = false } = {}) {
  const onOpen = vi.fn();
  const onReset = vi.fn();
  render(<CreatorContentTable rows={rows} filtered={filtered} onOpen={onOpen} onReset={onReset} />);
  return { onOpen, onReset };
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
    ).toEqual(["Konten", "Tipe", "Deadline↑Deadline", "Status", "Platform"]);
  });

  // The row and the content's name open it; there is no Detail or Tinjau button any more.
  it("has no Detail or Tinjau button on a row, whatever its status", () => {
    renderTable([
      ROW,
      { ...ROW, contentId: "c-2", name: "Konten Kedua", status: "draft_review" },
      { ...ROW, contentId: "c-3", name: "Konten Ketiga", status: "link_submitted" },
    ]);

    expect(screen.queryByRole("button", { name: /^(Detail|Tinjau) / })).toBeNull();
  });

  // Measured in Edge at true 320/375/390/430 px: the table is 628 px wide in a 286-396 px area,
  // so Status and its tags sat off-screen. Below lg each row reads as a card,
  // as the roster and Task Saya do. jsdom lays nothing out, so these pin what the layout is built
  // from; the browser measurement is the evidence for the layout itself.
  describe("on a phone, below lg", () => {
    function cells() {
      return within(rowOf("Evg_7_RanggaPratama_26092026")).getAllByRole("cell");
    }

    // A table whose display changes can lose its semantics in some browsers, so the table, its
    // row groups and its rows carry explicit roles; a cell takes its role from the row it sits in.
    it("reads each card as a row of cells, one per column, under explicit table roles", () => {
      renderTable([ROW, { ...ROW, contentId: "c-2", name: "Spc_Done", status: "link_submitted" }]);

      const table = screen.getByRole("table");
      expect(table).toHaveAttribute("role", "table");
      for (const group of within(table).getAllByRole("rowgroup")) {
        expect(group).toHaveAttribute("role", "rowgroup");
      }
      const columns = within(table).getAllByRole("columnheader");
      const [, ...records] = within(table).getAllByRole("row");
      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(record).toHaveAttribute("role", "row");
        expect(within(record).getAllByRole("cell")).toHaveLength(columns.length);
      }
    });

    it("keeps table semantics while the rows stack as cards", () => {
      renderTable();

      expect(screen.getByRole("table")).toHaveClass("max-lg:block");
      expect(screen.getAllByRole("rowgroup")[0]).toHaveClass("max-lg:sr-only");
      expect(rowOf("Evg_7_RanggaPratama_26092026")).toHaveClass("max-lg:block");
      expect(cells()).toHaveLength(5);
    });

    it("names the deadline and the status by their columns, since the headers are hidden", () => {
      renderTable();

      expect(cells().map((cell) => cell.dataset.label ?? null)).toEqual([
        null,
        "Tipe",
        "Deadline",
        "Status",
        "Platform",
      ]);
    });

    it("lets a long name wrap instead of holding the card wider than the phone", () => {
      renderTable();

      const [name] = cells();
      expect(name).toHaveClass("min-w-52");
      expect(name).toHaveClass("max-lg:min-w-0");
    });

    it("keeps one sort control per width: the header's button is removed below lg, its name kept", () => {
      renderTable();

      const header = screen.getByRole("columnheader", { name: /Deadline/ });
      expect(within(header).getByRole("button")).toHaveClass("max-lg:hidden");
      expect(within(header).getByText("Deadline", { selector: "span" })).toHaveClass("lg:hidden");
    });
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
    ["evergreen", "Evergreen", "bg-surface-2"],
    ["specific", "Specific", "bg-accent-wash"],
  ] as const)("draws a %s content's type as a badge of its own colour", (type, label, colour) => {
    renderTable([{ ...ROW, type }]);

    expect(screen.getByText(label)).toHaveClass("rounded-full", colour);
  });

  it("shows the marks of the platforms the content was posted to (AC 13)", () => {
    render(
      <CreatorContentTable
        rows={[
          {
            ...ROW,
            platforms: ["instagram", "tiktok"],
          },
        ]}
        filtered={false}
        onOpen={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "TikTok" })).toBeInTheDocument();
  });

  it("gives the type a column beside the content, and the platforms one right of the status", () => {
    renderTable([{ ...ROW, platforms: ["instagram"] }]);

    const [, type, , status, platform] = within(rowOf("Evg_7_RanggaPratama_26092026")).getAllByRole("cell");
    expect(within(type).getByText("Evergreen")).toHaveClass("rounded-full");
    expect(within(platform).getByRole("img", { name: "Instagram" })).toBeInTheDocument();
    expect(status.compareDocumentPosition(platform) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no marks for a content with no link sent yet", () => {
    render(
      <CreatorContentTable rows={[ROW]} filtered={false} onOpen={vi.fn()} onReset={vi.fn()} />,
    );

    expect(screen.queryByRole("img", { name: "Instagram" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "TikTok" })).not.toBeInTheDocument();
  });

  it.each([
    ["overdue", "Overdue"],
    ["late_submission", "Late Submission"],
  ] as const)("reds the deadline of a %s content instead of a badge, still naming it for a screen reader", (tag, label) => {
    renderTable([{ ...ROW, tags: [tag, "approval_bypassed"] }]);

    const deadline = within(rowOf("Evg_7_RanggaPratama_26092026")).getAllByRole("cell")[2];
    expect(deadline.firstElementChild).toHaveClass("text-red-ink");
    expect(within(deadline).getByText(`(${label})`)).toHaveClass("sr-only");
    expect(screen.queryByRole("listitem", { name: label })).toBeNull();
    expect(within(screen.getByRole("list", { name: "Tanda konten" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Approval di-bypass",
    ]);
  });

  it("leaves an on-time deadline in ink", () => {
    renderTable();

    expect(within(rowOf("Evg_7_RanggaPratama_26092026")).getAllByRole("cell")[2].firstElementChild).not.toHaveClass(
      "text-red-ink",
    );
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

    it("opens it once from the name, not once for the name and once for the row", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByRole("button", { name: "Evg_7_RanggaPratama_26092026" }));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
    });

    it("opens the content that was pressed, among several", () => {
      const { onOpen } = renderTable([ROW, { ...ROW, contentId: "c-2", name: "Konten Kedua" }]);

      fireEvent.click(screen.getByText("Konten Kedua"));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-2");
    });

    it("leaves the heading row alone", () => {
      const { onOpen } = renderTable();

      fireEvent.click(within(screen.getByRole("columnheader", { name: /Deadline/ })).getByRole("button"));

      expect(onOpen).not.toHaveBeenCalled();
    });

    describe("when the press ends a text selection", () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("does not open the panel when the selection ends on the row itself", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
          toString: () => "26 Sep",
        } as Selection);
        const { onOpen } = renderTable();

        fireEvent.click(screen.getByText("26 Sep 2026"));

        expect(onOpen).not.toHaveBeenCalled();
      });

      it("does not open the panel over the text just selected", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
          toString: () => "RanggaPratama",
        } as Selection);
        const { onOpen } = renderTable();

        fireEvent.click(screen.getByText("Evg_7_RanggaPratama_26092026"));

        expect(onOpen).not.toHaveBeenCalled();
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
        onOpen={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
  });

  it("keeps the action column in Selesai too, offering Detail for finished content", () => {
    const TabbedTable = CreatorContentTable as unknown as ComponentType<{
      rows: readonly CreatorContentRow[];
      filtered: boolean;
      tab: "done";
      sort: "asc";
      onSortToggle: () => void;
      onOpen: (id: string) => void;
      onReset: () => void;
    }>;
    render(
      <TabbedTable
        rows={[{ ...ROW, status: "link_submitted", tags: ["late_submission"] }]}
        filtered={false}
        tab="done"
        sort="asc"
        onSortToggle={vi.fn()}
        onOpen={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByText("Evg_7_RanggaPratama_26092026")).toBeInTheDocument();
    expect(screen.getByText("(Late Submission)")).toHaveClass("sr-only");
    expect(screen.queryByRole("button", { name: /^(Tinjau|Detail) / })).toBeNull();
  });

  // At 1024px the table scrolled sideways with nothing to say more columns sat past the edge;
  // it sits in the frame that fades that edge (as Content Plan's does).
  it("sits in a frame that fades the edge hiding more columns", () => {
    renderTable();

    expect(screen.getByRole("table").closest("[data-scroll-frame]")).not.toBeNull();
  });

  it("centres every cell of a row on one line, the action button included", () => {
    renderTable();

    for (const cell of within(rowOf("Evg_7_RanggaPratama_26092026")).getAllByRole("cell")) {
      expect(cell).toHaveClass("align-middle");
    }
  });
});
