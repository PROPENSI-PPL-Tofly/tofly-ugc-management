import { render, screen } from "@testing-library/react";
import { creator, listResponse } from "@/components/creators/creator.fixture";
import { fetchCreators } from "@/lib/creators";
import CreatorsPage from "./page";

vi.mock("@/lib/creators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/creators")>();
  return { ...actual, fetchCreators: vi.fn() };
});

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/creators" }));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  render(await CreatorsPage({ searchParams: Promise.resolve(params) }));
}

describe("Creator database page", () => {
  beforeEach(() => {
    vi.mocked(fetchCreators).mockReset();
  });

  it("loads the page named in the URL and renders it", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(
      listResponse({ items: [creator()], page: 2, total: 12, totalPages: 2 }),
    );

    await renderPage({ page: "2" });

    expect(fetchCreators).toHaveBeenCalledWith(2);
    expect(screen.getByRole("heading", { level: 1, name: "Creator Database" })).toBeInTheDocument();
    expect(screen.getByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Halaman 2 dari 2")).toBeInTheDocument();
  });

  it("starts on the first page without a query", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage();

    expect(fetchCreators).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("falls back to the first page and says why when the page is not a number", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage({ page: "abc" });

    expect(fetchCreators).toHaveBeenCalledWith(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Halaman “abc” tidak dikenal, menampilkan halaman pertama.",
    );
  });

  it("explains when the backend cannot be reached instead of crashing", async () => {
    vi.mocked(fetchCreators).mockRejectedValue(new Error("Loading creators failed with HTTP 503"));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Data creator tidak bisa dimuat.");
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
    expect(screen.queryByRole("table")).toBeNull();
  });
});
