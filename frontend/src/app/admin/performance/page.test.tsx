import { render, screen, within } from "@testing-library/react";
import { PerformanceLinksError, type PerformanceLinksPage } from "@/lib/performance-links";
import { fetchPerformanceLinks } from "@/lib/performance-links.server";
import PerformancePage from "./page";
import Loading from "./loading";

vi.mock("@/lib/performance-links.server", () => ({ fetchPerformanceLinks: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/performance",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const mockedLinks = vi.mocked(fetchPerformanceLinks);

const EMPTY: PerformanceLinksPage = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
};

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  return render(<>{await PerformancePage({ searchParams: Promise.resolve(params) })}</>);
}

beforeEach(() => {
  mockedLinks.mockReset();
});

describe("Performa Konten page", () => {
  it("opens in the admin frame under the Performa Konten title", async () => {
    mockedLinks.mockResolvedValue(EMPTY);

    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Performa Konten" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu admin" })).toBeInTheDocument();
  });

  it("says no link has been sent when the list holds nothing (AC 23)", async () => {
    mockedLinks.mockResolvedValue(EMPTY);

    await renderPage();

    expect(screen.getByText("Belum ada link yang dikirim")).toBeInTheDocument();
  });

  it("falls back to an error, never an empty table, when the list fails", async () => {
    mockedLinks.mockRejectedValue(new PerformanceLinksError(502));

    await renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Performa Konten tidak bisa dimuat.");
    expect(within(alert).getByRole("link", { name: "Muat ulang" })).toBeInTheDocument();
    expect(screen.queryByText("Belum ada link yang dikirim")).not.toBeInTheDocument();
  });

  it("offers a loading line while the page is still rendering", () => {
    render(<Loading />);

    expect(screen.getByRole("status")).toHaveTextContent("Memuat data performa");
  });
});
