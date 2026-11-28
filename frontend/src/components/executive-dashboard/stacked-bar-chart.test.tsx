import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { SPENDING_SEGMENTS, spendingRows, type MonthSeries } from "@/lib/executive-dashboard";
import { formatRupiah } from "@/lib/format";
import { ChartTooltipBody, StackedBarChart } from "./stacked-bar-chart";

// jsdom has no layout, so ResponsiveContainer would measure 0×0 and draw nothing; a fixed size
// lets the chart render and keeps the test about what the page shows.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 600, height: 260 }}>{children}</div>
    ),
  };
});

function month(name: string, fixedRate: number, additionalContent: number, performanceBonus: number): MonthSeries {
  return {
    month: name,
    spending: { fixedRate, additionalContent, performanceBonus },
    views: { instagram: 0, tiktok: 0 },
    delivery: { onTime: 0, late: 0, notSent: 0 },
  };
}

const ROWS = spendingRows([month("2026-10", 1_000_000, 250_000, 0), month("2026-11", 2_000_000, 0, 500_000)]);

function renderChart(rows = ROWS) {
  return render(
    <StackedBarChart
      title="Spending per Bulan"
      rows={rows}
      segments={SPENDING_SEGMENTS}
      unit="rupiah"
      emptyTitle="Belum ada spending di rentang ini."
    />,
  );
}

describe("StackedBarChart", () => {
  it("takes its unit by name, so a server page can pass it to this client chart", () => {
    render(
      <StackedBarChart
        title="Views per Bulan"
        rows={ROWS}
        segments={SPENDING_SEGMENTS}
        unit="count"
        emptyTitle="Kosong"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Lihat Tabel" }));
    const first = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(within(first).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Okt 2026",
      "1.000.000",
      "250.000",
      "0",
      "1.250.000",
    ]);
  });

  it("names the chart and every part of the stack in its legend", () => {
    renderChart();

    expect(screen.getByRole("heading", { name: "Spending per Bulan" })).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "Legenda Spending per Bulan" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Fixed Rate",
      "Konten Tambahan",
      "Bonus Performa",
    ]);
  });

  it("shows the same numbers as a table after Lihat Tabel, with each month's total, and goes back", () => {
    renderChart();

    fireEvent.click(screen.getByRole("button", { name: "Lihat Tabel" }));

    const table = screen.getByRole("table", { name: "Spending per Bulan" });
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Bulan", "Fixed Rate", "Konten Tambahan", "Bonus Performa", "Total"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["Okt 2026", "Rp1.000.000", "Rp250.000", "Rp0", "Rp1.250.000"],
      ["Nov 2026", "Rp2.000.000", "Rp0", "Rp500.000", "Rp2.500.000"],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Lihat Grafik" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says so instead of drawing an empty axis when no month has anything to stack", () => {
    renderChart(spendingRows([month("2026-11", 0, 0, 0)]));

    expect(screen.getByText("Belum ada spending di rentang ini.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lihat Tabel" })).not.toBeInTheDocument();
  });
});

describe("ChartTooltipBody", () => {
  it("lists each part of the hovered month and its total", () => {
    render(<ChartTooltipBody row={ROWS[0]} segments={SPENDING_SEGMENTS} format={formatRupiah} />);

    expect(screen.getByText("Okt 2026")).toBeInTheDocument();
    const lines = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(lines).toEqual([
      "Fixed RateRp1.000.000",
      "Konten TambahanRp250.000",
      "Bonus PerformaRp0",
      "TotalRp1.250.000",
    ]);
  });
});
