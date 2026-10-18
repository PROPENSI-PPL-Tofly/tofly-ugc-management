import { act, fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceRow } from "@/lib/invoice";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { BreakdownAmount } from "./breakdown-amount";
import { useBreakdownPopups, type BreakdownLoader } from "./use-breakdown-popups";

// The panel is tested where it lives, and fetches a content on its own. Here it is a stand-in
// that shows what it was handed and offers the presses the popups have to answer.
vi.mock("@/components/content-detail/content-detail-panel", () => ({
  ContentDetailPanel: ({
    contentId,
    role,
    onClose,
    onDecided,
  }: {
    contentId: string;
    role: string;
    onClose: () => void;
    onDecided: (decision: "approve" | "revise") => void;
  }) => (
    <div data-testid="content-detail" data-content={contentId} data-role={role}>
      <button type="button" onClick={onClose}>
        Tutup panel
      </button>
      <button type="button" onClick={() => onDecided("approve")}>
        Setujui
      </button>
    </div>
  ),
}));

// The real loader is a server action; the popups only need something that answers a creator.
vi.mock("@/lib/invoice-breakdown.server", () => ({ loadInvoiceBreakdown: vi.fn() }));

function rowOf(creatorId: string, creatorName: string): InvoiceRow {
  return {
    creatorId,
    creatorName,
    contractStatus: "active",
    fixedAmount: 1000000,
    extraAmount: 1000000,
    bonusAmount: null,
    penaltyAmount: 150000,
    totalAmount: 0,
    floored: false,
    invoiceStatus: "accruing",
  };
}

const RANGGA_ROW = rowOf("creator-rangga", "Rangga Pratama");
const SALSA_ROW = rowOf("creator-salsa", "Salsa Amelia");

const RANGGA: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: {
    period: { number: 1, start: "2026-09-01", end: "2026-11-30", quotaDone: 2, quotaTotal: 10 },
    total: 1000000,
    notStarted: false,
  },
  extra: {
    lines: [
      { contentId: "c-1", name: "Evg_1_Rangga_01102026", rate: 500000, amount: 500000 },
      { contentId: "c-2", name: "Evg_2_Rangga_08102026", rate: 500000, amount: 500000 },
    ],
    total: 1000000,
  },
  bonus: { lines: [], total: 0, performance: "waiting", rules: { tiers: [], specificBonus: 0 } },
  penalty: {
    lines: [
      {
        contentId: "c-3",
        name: "Evg_3_Rangga_15102026",
        daysLate: 3,
        chargedDays: 3,
        ratePerDay: 50000,
        amount: 150000,
        ongoing: true,
      },
    ],
    total: 150000,
  },
};

const SALSA: InvoiceBreakdown = {
  ...RANGGA,
  creatorName: "Salsa Amelia",
  extra: {
    lines: [{ contentId: "s-1", name: "Evg_1_Salsa_02102026", rate: 400000, amount: 400000 }],
    total: 400000,
  },
};

const BREAKDOWNS: Record<string, InvoiceBreakdown> = {
  "creator-rangga": RANGGA,
  "creator-salsa": SALSA,
};

/** A loader that answers from the table above, at once. */
function answering(): ReturnType<typeof vi.fn<BreakdownLoader>> {
  return vi.fn<BreakdownLoader>(async (creatorId) => BREAKDOWNS[creatorId] ?? null);
}

/** Two rows of a table sharing one set of popups, the way the Rate & Invoicing table does. */
function Table({
  load,
  onDecided,
}: Readonly<{ load: BreakdownLoader; onDecided?: (decision: string) => void }>) {
  const { open, layers } = useBreakdownPopups({ load, onDecided });

  return (
    <>
      <BreakdownAmount kind="extra" row={RANGGA_ROW} onOpen={open} />
      <BreakdownAmount kind="penalty" row={RANGGA_ROW} onOpen={open} />
      <BreakdownAmount kind="extra" row={SALSA_ROW} onOpen={open} />
      {layers}
    </>
  );
}

const cell = (name: RegExp) => screen.getByRole("button", { name });
const popup = () => screen.queryByRole("dialog");
const panel = () => screen.queryByTestId("content-detail");

/** Renders the table and opens one cell's breakdown, waiting for it to load. */
async function openCell(name: RegExp, load: BreakdownLoader = answering(), onDecided = vi.fn()) {
  render(<Table load={load} onDecided={onDecided} />);
  fireEvent.click(cell(name));
  await screen.findByRole("list");
  return { load, onDecided };
}

describe("useBreakdownPopups", () => {
  it("shows nothing and loads nothing until an amount is pressed", () => {
    const load = answering();
    render(<Table load={load} />);

    expect(popup()).not.toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it("opens at once, titled, and loads the pressed creator's breakdown", async () => {
    const load = answering();
    render(<Table load={load} />);

    fireEvent.click(cell(/^Penalti Rangga Pratama/));

    expect(popup()).toHaveAccessibleName("Penalti · Rangga Pratama");
    expect(screen.getByRole("status")).toHaveTextContent("Memuat rincian…");
    expect(load).toHaveBeenCalledWith("creator-rangga");

    expect(await screen.findByRole("list")).toHaveTextContent("Evg_3_Rangga_15102026");
  });

  it("keeps each creator's breakdown apart", async () => {
    await openCell(/^Konten Tambahan Salsa Amelia/);

    expect(popup()).toHaveAccessibleName("Fee Konten Tambahan · Salsa Amelia");
    expect(popup()).toHaveTextContent("Evg_1_Salsa_02102026");
    expect(popup()).not.toHaveTextContent("Evg_1_Rangga_01102026");
  });

  it("asks once per creator, reading a second column of the same creator from what it has", async () => {
    const { load } = await openCell(/^Konten Tambahan Rangga Pratama/);
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    fireEvent.click(cell(/^Penalti Rangga Pratama/));

    expect(screen.getByRole("list")).toHaveTextContent("Evg_3_Rangga_15102026");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("says when a breakdown cannot be loaded, and loads it again on request", async () => {
    const load = vi
      .fn<BreakdownLoader>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(RANGGA);
    render(<Table load={load} />);
    fireEvent.click(cell(/^Konten Tambahan Rangga Pratama/));

    expect(await screen.findByRole("alert")).toHaveTextContent("Rincian tidak bisa dimuat.");

    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    expect(await screen.findByRole("list")).toHaveTextContent("Evg_1_Rangga_01102026");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("says there is nothing to show for a creator the loader has no breakdown of, with no retry", async () => {
    render(<Table load={vi.fn<BreakdownLoader>(async () => null)} />);

    fireEvent.click(cell(/^Konten Tambahan Rangga Pratama/));

    expect(await screen.findByText("Tidak ada rincian untuk creator ini.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).not.toBeInTheDocument();
  });

  it("drops an answer that arrives after another breakdown was opened", async () => {
    let answerRangga: (value: InvoiceBreakdown) => void = () => undefined;
    const load = vi.fn<BreakdownLoader>((creatorId) =>
      creatorId === "creator-rangga"
        ? new Promise((resolve) => {
            answerRangga = resolve;
          })
        : Promise.resolve(SALSA),
    );
    render(<Table load={load} />);

    fireEvent.click(cell(/^Konten Tambahan Rangga Pratama/));
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    fireEvent.click(cell(/^Konten Tambahan Salsa Amelia/));
    await screen.findByRole("list");

    await act(async () => answerRangga(RANGGA));

    expect(popup()).toHaveAccessibleName("Fee Konten Tambahan · Salsa Amelia");
    expect(popup()).not.toHaveTextContent("Evg_1_Rangga_01102026");
  });

  it("drops a failure that arrives after another breakdown was opened", async () => {
    let failRangga: (reason: Error) => void = () => undefined;
    const load = vi.fn<BreakdownLoader>((creatorId) =>
      creatorId === "creator-rangga"
        ? new Promise((_resolve, reject) => {
            failRangga = reject;
          })
        : Promise.resolve(SALSA),
    );
    render(<Table load={load} />);

    fireEvent.click(cell(/^Konten Tambahan Rangga Pratama/));
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    fireEvent.click(cell(/^Konten Tambahan Salsa Amelia/));
    await screen.findByRole("list");

    await act(async () => failRangga(new Error("late")));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(popup()).toHaveTextContent("Evg_1_Salsa_02102026");
  });

  it("closes the breakdown from its Tutup button", async () => {
    await openCell(/^Konten Tambahan Rangga Pratama/);

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    expect(popup()).not.toBeInTheDocument();
  });

  it("opens the Content Detail panel of the content whose name is pressed, as an admin", async () => {
    await openCell(/^Konten Tambahan Rangga Pratama/);

    fireEvent.click(screen.getByRole("button", { name: "Evg_2_Rangga_08102026" }));

    expect(panel()).toHaveAttribute("data-content", "c-2");
    expect(panel()).toHaveAttribute("data-role", "admin");
  });

  it("hides the breakdown while the panel is open, so one layer is on screen, and brings it back", async () => {
    await openCell(/^Konten Tambahan Rangga Pratama/);
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));

    expect(popup()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tutup panel" }));

    expect(panel()).not.toBeInTheDocument();
    expect(popup()).toHaveAccessibleName("Fee Konten Tambahan · Rangga Pratama");
  });

  it("opens another content from the same breakdown after the first is closed", async () => {
    await openCell(/^Konten Tambahan Rangga Pratama/);
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutup panel" }));

    fireEvent.click(screen.getByRole("button", { name: "Evg_2_Rangga_08102026" }));

    expect(panel()).toHaveAttribute("data-content", "c-2");
  });

  it("closes the panel and the breakdown after a decision, whose numbers may now be stale", async () => {
    const { onDecided } = await openCell(/^Konten Tambahan Rangga Pratama/);
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));

    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    expect(panel()).not.toBeInTheDocument();
    expect(popup()).not.toBeInTheDocument();
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(onDecided).toHaveBeenCalledWith("approve");
  });

  it("asks again after a decision, rather than showing what it held from before", async () => {
    const { load } = await openCell(/^Konten Tambahan Rangga Pratama/);
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    fireEvent.click(cell(/^Penalti Rangga Pratama/));
    await screen.findByRole("list");

    expect(load).toHaveBeenCalledTimes(2);
    expect(panel()).not.toBeInTheDocument();
  });

  it("takes a decision without a listener", async () => {
    render(<Table load={answering()} />);
    fireEvent.click(cell(/^Konten Tambahan Rangga Pratama/));
    await screen.findByRole("list");
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));

    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    expect(popup()).not.toBeInTheDocument();
  });
});

describe("useBreakdownPopups without a loader", () => {
  it("asks the Rate & Invoicing server action by default", async () => {
    const { loadInvoiceBreakdown } = await import("@/lib/invoice-breakdown.server");
    vi.mocked(loadInvoiceBreakdown).mockResolvedValue(RANGGA);

    function DefaultTable() {
      const { open, layers } = useBreakdownPopups();
      return (
        <>
          <BreakdownAmount kind="extra" row={RANGGA_ROW} onOpen={open} />
          {layers}
        </>
      );
    }
    render(<DefaultTable />);

    fireEvent.click(cell(/^Konten Tambahan Rangga Pratama/));

    expect(await screen.findByRole("list")).toHaveTextContent("Evg_1_Rangga_01102026");
    expect(loadInvoiceBreakdown).toHaveBeenCalledWith("creator-rangga");
  });
});

describe("useBreakdownPopups after the table is read again", () => {
  /** One row whose amounts the test can change, as a refreshed page would. */
  function Row({ row, load }: Readonly<{ row: InvoiceRow; load: BreakdownLoader }>) {
    const { open, layers } = useBreakdownPopups({ load });
    return (
      <>
        <BreakdownAmount kind="penalty" row={row} onOpen={open} />
        {layers}
      </>
    );
  }

  it("asks again once the row's amounts have changed, so a popup never disagrees with its cell", async () => {
    const later: InvoiceBreakdown = {
      ...RANGGA,
      penalty: {
        lines: [
          {
            contentId: "c-3",
            name: "Evg_3_Rangga_15102026",
            daysLate: 4,
            chargedDays: 3,
            ratePerDay: 50000,
            amount: 200000,
            ongoing: true,
          },
        ],
        total: 200000,
      },
    };
    const load = vi.fn<BreakdownLoader>().mockResolvedValueOnce(RANGGA).mockResolvedValueOnce(later);
    const view = render(<Row row={RANGGA_ROW} load={load} />);
    fireEvent.click(cell(/^Penalti Rangga Pratama/));
    await screen.findByRole("list");
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    view.rerender(<Row row={{ ...RANGGA_ROW, penaltyAmount: 200000 }} load={load} />);
    fireEvent.click(cell(/^Penalti Rangga Pratama/));

    expect(await screen.findByText("Telat 4 hari · dihitung 3 hari × Rp50.000 · berjalan")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps what it read while the row's amounts stay the same", async () => {
    const load = answering();
    const view = render(<Row row={RANGGA_ROW} load={load} />);
    fireEvent.click(cell(/^Penalti Rangga Pratama/));
    await screen.findByRole("list");
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    view.rerender(<Row row={{ ...RANGGA_ROW }} load={load} />);
    fireEvent.click(cell(/^Penalti Rangga Pratama/));

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
