import { fireEvent, render, screen, within } from "@testing-library/react";
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

function renderTable(rows: CreatorContentRow[] = [ROW], { filtered = false } = {}) {
  const onOpen = vi.fn();
  render(<CreatorContentTable rows={rows} filtered={filtered} onOpen={onOpen} />);
  return { onOpen };
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
    ).toEqual(["Konten", "Deadline", "Status", "Aksi"]);
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

  // Measured in Edge at true 320/375/390/430 px: the table is 628 px wide in a 286-396 px area,
  // so Status, its tags and Detail/Tinjau all sat off-screen. Below lg each row reads as a card,
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
      expect(cells()).toHaveLength(4);
    });

    it("names the deadline and the status by their columns, since the headers are hidden", () => {
      renderTable();

      expect(cells().map((cell) => cell.dataset.label ?? null)).toEqual([
        null,
        "Deadline",
        "Status",
        null,
      ]);
    });

    it("lets a long name wrap instead of holding the card wider than the phone", () => {
      renderTable();

      const [name] = cells();
      expect(name).toHaveClass("min-w-52");
      expect(name).toHaveClass("max-lg:min-w-0");
    });

    it("gives Detail and Tinjau a full-width touch target at least 44px tall", () => {
      renderTable([ROW, { ...ROW, contentId: "c-2", name: "Spc_Done", status: "link_submitted" }]);

      for (const name of ["Tinjau Evg_7_RanggaPratama_26092026", "Detail Spc_Done"]) {
        const button = screen.getByRole("button", { name });
        expect(button).toHaveClass("max-lg:w-full");
        expect(button).toHaveClass("max-lg:min-h-11");
      }
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

  // The prototype draws a status as a pill. The colour is the one every admin view gives it.
  it.each([
    ["pending", "Pending", "bg-accent-wash"],
    ["scheduled", "Scheduled", "bg-surface-2"],
    ["draft_review", "Draft Menunggu Review", "bg-accent-wash"],
    ["draft_revision", "Draft Perlu Revisi", "bg-amber-wash"],
    ["draft_approved", "Draft Approved", "bg-green-wash"],
    ["link_submitted", "Content Link Submitted", "bg-green-wash"],
  ] as const)("draws the status %s as a pill in its own colour", (status, label, colour) => {
    renderTable([{ ...ROW, status }]);

    const pill = screen.getByText(label);
    expect(pill).toHaveClass("rounded-full", colour);
    // A pill carries its own colour: no separate dot beside the words.
    expect(pill.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("shows every tag the content carries beside its status", () => {
    renderTable([{ ...ROW, tags: ["late_submission", "overdue", "approval_bypassed"] }]);

    expect(screen.getByText("Late Submission")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Approval di-bypass")).toBeInTheDocument();
  });

  it("counts the revisions an admin asked for", () => {
    renderTable([{ ...ROW, status: "draft_revision", revisionCount: 2 }]);

    expect(screen.getByText("Revisi ke-2")).toBeInTheDocument();
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

    it("opens it once from the button, not once for the button and once for the row", () => {
      const { onOpen } = renderTable();

      fireEvent.click(screen.getByRole("button", { name: "Tinjau Evg_7_RanggaPratama_26092026" }));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-1");
    });

    it.each([
      ["pending", "Tinjau"],
      ["draft_review", "Tinjau"],
      ["scheduled", "Detail"],
      ["draft_revision", "Detail"],
      ["draft_approved", "Detail"],
      ["link_submitted", "Detail"],
    ] as const)("words the button for a %s content as %s", (status, label) => {
      renderTable([{ ...ROW, status }]);

      expect(
        screen.getByRole("button", { name: `${label} Evg_7_RanggaPratama_26092026` }),
      ).toHaveTextContent(label);
    });

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
      renderTable([], { filtered: true });

      expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
      expect(screen.getByText("Longgarkan filternya atau tekan Reset.")).toBeInTheDocument();
      expect(screen.queryByText("Belum ada konten pada periode kontrak ini.")).toBeNull();
    });
  });

  it("shows markup in a content's name as the text it is, never as markup", () => {
    const { container } = render(
      <CreatorContentTable
        rows={[{ ...ROW, name: '<img src=x onerror="alert(1)">' }]}
        filtered={false}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
  });
});
