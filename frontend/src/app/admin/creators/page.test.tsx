import { fireEvent, render, screen } from "@testing-library/react";
import { creator, listResponse } from "@/components/creators/creator.fixture";
import { fetchCreators } from "@/lib/creators";
import CreatorsPage from "./page";

vi.mock("@/lib/creators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/creators")>();
  return { ...actual, fetchCreators: vi.fn() };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/creators",
  useSearchParams: () => new URLSearchParams(),
}));

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

    expect(fetchCreators).toHaveBeenCalledWith(2, { q: "", contractStatus: "all", productivity: "all" });
    expect(screen.getByRole("heading", { level: 1, name: "Creator Database" })).toBeInTheDocument();
    expect(screen.getByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Halaman 2 dari 2")).toBeInTheDocument();
  });

  it("starts on the first page without a query", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage();

    expect(fetchCreators).toHaveBeenCalledWith(1, { q: "", contractStatus: "all", productivity: "all" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("falls back to the first page and says why when the page is not a number", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage({ page: "abc" });

    expect(fetchCreators).toHaveBeenCalledWith(1, { q: "", contractStatus: "all", productivity: "all" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Halaman “abc” tidak dikenal, menampilkan halaman pertama.",
    );
  });

  it("renders whatever was typed in the URL as text, never as markup", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage({ page: "<img src=x onerror=alert(1)>" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Halaman “<img src=x onerror=alert(1)>” tidak dikenal, menampilkan halaman pertama.",
    );
    expect(document.querySelector("img")).toBeNull();
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

  it("passes filter params from URL to fetchCreators", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage({ q: "rangga", contractStatus: "active", productivity: "good" });

    expect(fetchCreators).toHaveBeenCalledWith(1, {
      q: "rangga",
      contractStatus: "active",
      productivity: "good",
    });
  });

  it("renders the CreatorFilters component", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage();

    expect(screen.getByRole("searchbox", { name: /cari creator/i })).toBeInTheDocument();
  });

  // There is no "+ Tambah Creator" trigger on the page yet — GREEN adds it, wired to open
  // AddCreatorModal (already built and unit-tested on its own in add-creator-modal.test.tsx).
  it("opens the Add Creator modal when the trigger is clicked", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(listResponse());

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /tambah creator/i }));

    expect(screen.getByRole("dialog", { name: /tambah creator/i })).toBeInTheDocument();
  });

  // The page already fetches result.items (with each creator's email) for the table —
  // AddCreatorTrigger/AddCreatorModal do not receive it yet, so the modal's duplicate check
  // has nothing to compare against. GREEN threads it through, no new fetch involved.
  it("keeps Simpan disabled when the typed email matches an already-loaded creator", async () => {
    vi.mocked(fetchCreators).mockResolvedValue(
      listResponse({ items: [creator({ email: "existing@example.com" })] }),
    );

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /tambah creator/i }));

    fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "existing@example.com" } });
    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2099-01-01" } });
    fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "6" } });

    expect(screen.getByRole("button", { name: /simpan/i })).toBeDisabled();
  });
});
