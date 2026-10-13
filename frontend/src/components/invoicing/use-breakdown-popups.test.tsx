import { fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { BreakdownAmount } from "./breakdown-amount";
import { useBreakdownPopups } from "./use-breakdown-popups";

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

const RANGGA: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: {
    lines: [
      { contentId: "c-1", name: "Evg_1_Rangga_01102026", rate: 500000, amount: 500000 },
      { contentId: "c-2", name: "Evg_2_Rangga_08102026", rate: 500000, amount: 500000 },
    ],
    total: 1000000,
  },
  extra: { lines: [], total: 0 },
  bonus: { lines: [], total: 0, performance: "waiting" },
  penalty: {
    lines: [
      {
        contentId: "c-3",
        name: "Evg_3_Rangga_15102026",
        daysLate: 3,
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
  fixed: {
    lines: [{ contentId: "s-1", name: "Evg_1_Salsa_02102026", rate: 400000, amount: 400000 }],
    total: 400000,
  },
};

/** Two rows of a table sharing one set of popups, the way the Rate & Invoicing table will. */
function Table({ onDecided }: Readonly<{ onDecided?: (decision: string) => void }>) {
  const { open, layers } = useBreakdownPopups({ onDecided });

  return (
    <>
      <BreakdownAmount kind="fixed" breakdown={RANGGA} onOpen={open} />
      <BreakdownAmount kind="penalty" breakdown={RANGGA} onOpen={open} />
      <BreakdownAmount kind="fixed" breakdown={SALSA} onOpen={open} />
      {layers}
    </>
  );
}

const cell = (name: RegExp) => screen.getByRole("button", { name });
const popup = () => screen.queryByRole("dialog");
const panel = () => screen.queryByTestId("content-detail");

describe("useBreakdownPopups", () => {
  it("shows nothing until an amount is pressed", () => {
    render(<Table />);

    expect(popup()).not.toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
  });

  it("opens the breakdown of the column and the creator that was pressed", () => {
    render(<Table />);

    fireEvent.click(cell(/^Penalti Rangga Pratama/));

    expect(popup()).toHaveAccessibleName("Penalti · Rangga Pratama");
    expect(popup()).toHaveTextContent("Evg_3_Rangga_15102026");
  });

  it("keeps each creator's breakdown apart", () => {
    render(<Table />);

    fireEvent.click(cell(/^Fixed Rate Salsa Amelia/));

    expect(popup()).toHaveAccessibleName("Fixed Rate · Salsa Amelia");
    expect(popup()).toHaveTextContent("Evg_1_Salsa_02102026");
    expect(popup()).not.toHaveTextContent("Evg_1_Rangga_01102026");
  });

  it("closes the breakdown from its Tutup button", () => {
    render(<Table />);
    fireEvent.click(cell(/^Fixed Rate Rangga Pratama/));

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    expect(popup()).not.toBeInTheDocument();
  });

  it("opens the Content Detail panel of the content whose name is pressed, as an admin", () => {
    render(<Table />);
    fireEvent.click(cell(/^Fixed Rate Rangga Pratama/));

    fireEvent.click(screen.getByRole("button", { name: "Evg_2_Rangga_08102026" }));

    expect(panel()).toHaveAttribute("data-content", "c-2");
    expect(panel()).toHaveAttribute("data-role", "admin");
  });

  it("keeps the breakdown open under the panel, to come back to", () => {
    render(<Table />);
    fireEvent.click(cell(/^Fixed Rate Rangga Pratama/));
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));

    expect(popup()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tutup panel" }));

    expect(panel()).not.toBeInTheDocument();
    expect(popup()).toHaveAccessibleName("Fixed Rate · Rangga Pratama");
  });

  it("opens another content from the same breakdown after the first is closed", () => {
    render(<Table />);
    fireEvent.click(cell(/^Fixed Rate Rangga Pratama/));
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutup panel" }));

    fireEvent.click(screen.getByRole("button", { name: "Evg_2_Rangga_08102026" }));

    expect(panel()).toHaveAttribute("data-content", "c-2");
  });

  it("closes the panel and the breakdown after a decision, whose numbers may now be stale", () => {
    const onDecided = vi.fn();
    render(<Table onDecided={onDecided} />);
    fireEvent.click(cell(/^Fixed Rate Rangga Pratama/));
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));

    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    expect(panel()).not.toBeInTheDocument();
    expect(popup()).not.toBeInTheDocument();
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(onDecided).toHaveBeenCalledWith("approve");
  });

  it("takes a decision without a listener", () => {
    render(<Table />);
    fireEvent.click(cell(/^Fixed Rate Rangga Pratama/));
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));

    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    expect(popup()).not.toBeInTheDocument();
  });

  it("leaves no panel behind when the breakdown is opened again", () => {
    render(<Table />);
    fireEvent.click(cell(/^Fixed Rate Rangga Pratama/));
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" }));
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    fireEvent.click(cell(/^Penalti Rangga Pratama/));

    expect(popup()).toHaveAccessibleName("Penalti · Rangga Pratama");
    expect(panel()).not.toBeInTheDocument();
  });
});
