import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExecutiveDashboardError, type ExecutiveDashboard } from "@/lib/executive-dashboard";
import { fetchExecutiveDashboard } from "@/lib/executive-dashboard.server";
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

const ANSWER: ExecutiveDashboard = {
  months: [
    {
      month: "2026-11",
      spending: { fixedRate: 1_000_000, additionalContent: 0, performanceBonus: 0 },
      views: { instagram: 100, tiktok: 50 },
      delivery: { onTime: 2, late: 1, notSent: 0 },
    },
  ],
  creators: [],
};

async function renderPage(params: Record<string, string> = {}) {
  return render(<>{await ExecutiveDashboardPage({ searchParams: Promise.resolve(params) })}</>);
}

beforeEach(() => mockedFetch.mockReset());

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

  it("offers a retry of the same view when the answer cannot be used, never charts of zeros", async () => {
    mockedFetch.mockRejectedValue(new ExecutiveDashboardError(502));

    await renderPage({ range: "3" });

    expect(screen.getByText("Dashboard tidak bisa dimuat.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Coba lagi|Muat ulang/ })).toHaveAttribute("href", "/admin/dashboard?range=3");
    expect(screen.queryByRole("heading", { name: "Spending per Bulan" })).not.toBeInTheDocument();
  });
});
