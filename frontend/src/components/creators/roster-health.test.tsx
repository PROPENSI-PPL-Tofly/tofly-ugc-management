import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RosterHealth } from "./roster-health";

const replace = vi.fn();
let currentQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/creators",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

const STATS = { total: 12, active: 9, good: 5, risk: 3 };

describe("RosterHealth", () => {
  beforeEach(() => {
    replace.mockClear();
    currentQuery = "";
  });

  it("states the size of the roster and how much of it is under contract", () => {
    render(<RosterHealth stats={STATS} productivity="all" />);

    expect(screen.getByText("12 creator")).toBeInTheDocument();
    expect(screen.getByText("9 dengan kontrak aktif")).toBeInTheDocument();
  });

  it("splits the roster into the three productivity bands", () => {
    render(<RosterHealth stats={STATS} productivity="all" />);

    expect(screen.getByRole("button", { name: "Baik, 5 creator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perlu perhatian, 4 creator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Berisiko, 3 creator" })).toBeInTheDocument();
  });

  it("sizes each band by its share of the roster", () => {
    render(<RosterHealth stats={STATS} productivity="all" />);

    const bar = screen.getByRole("img", { name: /5 baik, 4 perlu perhatian, 3 berisiko/i });
    const segments = bar.querySelectorAll("[data-band]");

    expect(segments[0]).toHaveStyle({ width: "41.67%" });
    expect(segments[2]).toHaveStyle({ width: "25%" });
  });

  it("filters the table to a band when that band is chosen", async () => {
    render(<RosterHealth stats={STATS} productivity="all" />);

    await userEvent.click(screen.getByRole("button", { name: "Berisiko, 3 creator" }));

    expect(replace).toHaveBeenCalledWith("/admin/creators?productivity=risk");
  });

  it("clears the band filter when the chosen band is picked again", async () => {
    currentQuery = "productivity=risk";
    render(<RosterHealth stats={STATS} productivity="risk" />);

    await userEvent.click(screen.getByRole("button", { name: "Berisiko, 3 creator" }));

    expect(replace).toHaveBeenCalledWith("/admin/creators");
  });

  it("marks the chosen band as pressed", () => {
    render(<RosterHealth stats={STATS} productivity="good" />);

    expect(screen.getByRole("button", { name: "Baik, 5 creator" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Berisiko, 3 creator" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("keeps its shape on an empty roster instead of dividing by zero", () => {
    render(<RosterHealth stats={{ total: 0, active: 0, good: 0, risk: 0 }} productivity="all" />);

    expect(screen.getByText("0 creator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baik, 0 creator" })).toBeInTheDocument();
  });
});
