import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExecutiveDashboardError } from "@/lib/executive-dashboard";
import { fetchExecutiveDashboard, type ExecutiveAnswer } from "@/lib/executive-dashboard.server";
import ExecutiveDashboardPage from "./page";

vi.mock("@/lib/executive-dashboard.server", () => ({ fetchExecutiveDashboard: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div style={{ width: 600, height: 260 }}>{children}</div>,
  };
});

const mockedFetch = vi.mocked(fetchExecutiveDashboard);

const ANSWER: ExecutiveAnswer = {
  months: [
    {
      month: "2026-11",
      spending: { fixedRate: 1_000_000, additionalContent: 0, performanceBonus: 0 },
      views: { instagram: 100, tiktok: 50 },
      delivery: { onTime: 2, late: 1, notSent: 0 },
    },
  ],
  creators: [],
  kpis: {
    current: {
      totalSpending: 1_000_000,
      unpaidAmount: 0,
      totalViews: 150,
      costPer1000Views: 6_666_666.7,
      onTimeRate: 66.7,
      engagementRate: null,
      linksAwaitingData: 3,
    },
    previous: {
      totalSpending: 0,
      unpaidAmount: 0,
      totalViews: 100,
      costPer1000Views: null,
      onTimeRate: 50,
      engagementRate: null,
    },
  },
  period: { from: "Jun 2026", to: "Nov 2026" },
};

const KPI_LABELS = ["Total Spending", "Belum Dibayar", "Total Views", "Biaya per 1.000 Views", "On-time Rate", "Engagement Rate"];

async function renderPage(params: Record<string, string> = {}) {
  return render(<>{await ExecutiveDashboardPage({ searchParams: Promise.resolve(params) })}</>);
}

// Braced: a returned mock would run as this hook's teardown.
beforeEach(() => {
  mockedFetch.mockReset();
});

describe("Executive dashboard page", () => {
  it("asks for the range in the address, falling back to six months for one it cannot hold", async () => {
    mockedFetch.mockResolvedValue(ANSWER);

    await renderPage({ range: "12", sort: "spending", order: "asc" });
    expect(mockedFetch).toHaveBeenLastCalledWith({ months: 12, sort: "spending", order: "asc" });

    await renderPage({ range: "7", sort: "drop table" });
    expect(mockedFetch).toHaveBeenLastCalledWith({ months: 6, sort: "views", order: "desc" });
  });

  it("shows the three charts and Performa Creator in the admin frame under Dashboard", async () => {
    mockedFetch.mockResolvedValue(ANSWER);

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    for (const title of ["Spending per Bulan", "Views per Bulan", "Ketepatan Pengiriman", "Performa Creator"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  // Prototype (Sprint 4, PBI-24): the months shown and 3 / 6 / 12 Bulan, then six KPI cards.
  it("shows the months shown, the range choice and the six KPI cards above the charts", async () => {
    mockedFetch.mockResolvedValue(ANSWER);

    await renderPage({ sort: "spending", order: "asc" });

    expect(screen.getByText("Jun 2026 – Nov 2026")).toBeInTheDocument();
    const range = screen.getByRole("group", { name: "Rentang" });
    expect(within(range).getByRole("link", { name: "3 Bulan" })).toHaveAttribute(
      "href",
      "/admin/dashboard?range=3&sort=spending&order=asc",
    );
    expect(within(range).getByRole("link", { name: "6 Bulan" })).toHaveAttribute("aria-current", "page");
    for (const label of KPI_LABELS) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("3 link belum ada data")).toBeInTheDocument();
  });

  it("offers a retry of the same view when the answer cannot be used, never charts of zeros", async () => {
    mockedFetch.mockRejectedValue(new ExecutiveDashboardError(502));

    await renderPage({ range: "3" });

    expect(screen.getByText("Dashboard tidak bisa dimuat.")).toBeInTheDocument();
    // The panel's retry and each card's lead back to the same view.
    const retries = screen.getAllByRole("link", { name: /Coba lagi|Muat ulang/ });
    expect(retries).toHaveLength(KPI_LABELS.length + 1);
    for (const retry of retries) expect(retry).toHaveAttribute("href", "/admin/dashboard?range=3");
    expect(screen.queryByRole("heading", { name: "Spending per Bulan" })).not.toBeInTheDocument();
    // Every KPI card says it failed, still under its label, and offers the same view again.
    expect(screen.getAllByText("Gagal dimuat.")).toHaveLength(KPI_LABELS.length);
    for (const label of KPI_LABELS) expect(screen.getByText(label)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Rentang" })).getByRole("link", { name: "3 Bulan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
