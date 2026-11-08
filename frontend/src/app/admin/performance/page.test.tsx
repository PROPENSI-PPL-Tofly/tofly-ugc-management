import { render, screen, within } from "@testing-library/react";
import { PerformanceLinksError, type PerformanceLinksPage } from "@/lib/performance-links";
import { fetchPerformanceLinks } from "@/lib/performance-links.server";
import { fetchContentPlanCreatorOptions } from "@/lib/content-plan.server";
import PerformancePage from "./page";
import Loading from "./loading";

vi.mock("@/lib/performance-links.server", () => ({ fetchPerformanceLinks: vi.fn() }));
vi.mock("@/lib/content-plan.server", () => ({ fetchContentPlanCreatorOptions: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/performance",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const mockedLinks = vi.mocked(fetchPerformanceLinks);
const mockedNames = vi.mocked(fetchContentPlanCreatorOptions);

const EMPTY: PerformanceLinksPage = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
};

/** One page of the API's rows, real-shaped: three pages' worth of links, ten a page. */
function answered(): PerformanceLinksPage {
  return {
    items: [
      {
        linkId: "33333333-3333-4333-8333-333333333333",
        contentId: "44444444-4444-4444-8444-444444444444",
        contentName: "Evg_1_RanggaPratama_12102026",
        creatorId: "11111111-1111-4111-8111-111111111111",
        creatorName: "Rangga Pratama",
        platform: "instagram",
        url: "https://instagram.com/p/x",
        views: 12400,
        likes: 900,
        comments: null,
        shares: null,
        state: "synced",
        lastSyncedAt: "2026-11-01T03:00:00.000Z",
        manualAt: null,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 21,
    totalPages: 3,
  };
}

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  return render(<>{await PerformancePage({ searchParams: Promise.resolve(params) })}</>);
}

beforeEach(() => {
  mockedLinks.mockReset();
  mockedNames.mockReset();
  mockedNames.mockResolvedValue([]);
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

  it("shows the pagination once, below the rows", async () => {
    mockedLinks.mockResolvedValue(answered());

    await renderPage();

    expect(screen.getAllByText(/Menampilkan 1/)).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Berikutnya" })).toHaveLength(1);
    // The first page has nowhere to go back to: its Sebelumnya is spent, not a link.
    expect(screen.getAllByText("Sebelumnya")).toHaveLength(1);
  });

  it("keeps the filter's choices empty rather than failing the page when the names fail", async () => {
    mockedLinks.mockResolvedValue(answered());
    mockedNames.mockRejectedValue(new Error("no names"));

    await renderPage();

    expect(screen.getByRole("button", { name: /^Creator:/ })).toBeInTheDocument();
    expect(screen.getByText("12.400")).toBeInTheDocument();
  });
});
