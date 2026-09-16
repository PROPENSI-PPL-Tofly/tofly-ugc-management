import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatorTable } from "./creator-table";
import { creatorDetail, creatorSummary } from "./creator.fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe("CreatorTable", () => {
  it("shows identity, contract, progress and performance for each creator", () => {
    render(<CreatorTable creators={[creatorSummary()]} />);

    const row = screen.getByRole("row", { name: /Rangga Pratama/ });

    expect(within(row).getByText("rangga@example.com")).toBeInTheDocument();
    expect(within(row).getByText("IG @rangga.creates")).toBeInTheDocument();
    expect(within(row).getByText("08 Jun 2026 — 25 Des 2026")).toBeInTheDocument();
    expect(within(row).getByText("sisa 100 hari")).toBeInTheDocument();
    expect(within(row).getByText("2/3 konten terkirim")).toBeInTheDocument();
    expect(within(row).getByText("100%")).toBeInTheDocument();
    expect(within(row).getByText("0,5x")).toBeInTheDocument();
    expect(within(row).getByText("Baik")).toBeInTheDocument();
  });

  it("marks an expired contract and says how long ago it ended", () => {
    render(
      <CreatorTable
        creators={[
          creatorSummary({
            id: "creator-salsa",
            name: "Salsa Amelia",
            contract: {
              status: "expired",
              startDate: "2026-02-18",
              endDate: "2026-08-17",
              daysRemaining: -30,
              periodNumber: 2,
              contentQuota: 4,
            },
          }),
        ]}
      />,
    );

    const row = screen.getByRole("row", { name: /Salsa Amelia/ });

    expect(within(row).getByText("Kontrak Expired")).toBeInTheDocument();
    expect(within(row).getByText("berakhir 30 hari lalu")).toBeInTheDocument();
    expect(within(row).getByText("Periode 2")).toBeInTheDocument();
  });

  it("writes a missing on-time rate as a dash rather than a zero", () => {
    render(
      <CreatorTable
        creators={[
          creatorSummary({
            performance: {
              onTimeRate: null,
              avgRevisions: 0,
              productivity: "watch",
              productivityLabel: "Belum Ada Data",
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Belum Ada Data")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("tells the admin how to recover when nothing matched", () => {
    render(<CreatorTable creators={[]} />);

    expect(screen.getByText(/Creator tidak ditemukan/i)).toBeInTheDocument();
    expect(screen.getByText(/ubah kata kunci atau filter/i)).toBeInTheDocument();
  });

  it("links each row straight to that creator's content plan", () => {
    render(<CreatorTable creators={[creatorSummary()]} />);

    expect(screen.getByRole("link", { name: /content plan/i })).toHaveAttribute(
      "href",
      "/admin/creators/creator-rangga/content-plan",
    );
  });

  it("closes the detail dialog again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(creatorDetail())),
    );

    render(<CreatorTable creators={[creatorSummary()]} />);
    await userEvent.click(screen.getByRole("button", { name: /detail/i }));
    await screen.findByRole("dialog", { name: /Rangga Pratama/ });

    await userEvent.click(screen.getByRole("button", { name: /tutup dialog/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it("opens the detail dialog from the row", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(creatorDetail())),
    );

    render(<CreatorTable creators={[creatorSummary()]} />);
    await userEvent.click(screen.getByRole("button", { name: /detail/i }));

    expect(await screen.findByRole("dialog", { name: /Rangga Pratama/ })).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
