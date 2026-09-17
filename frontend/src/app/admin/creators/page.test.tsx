import { render, screen } from "@testing-library/react";
import { creatorSummary } from "@/components/creators/creator.fixture";
import CreatorsPage from "./page";

const fetchCreators = vi.fn();

vi.mock("@/lib/creators", async () => {
  const actual = await vi.importActual<typeof import("@/lib/creators")>("@/lib/creators");
  return { ...actual, fetchCreators: (...args: unknown[]) => fetchCreators(...args) };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/creators",
  useSearchParams: () => new URLSearchParams(),
}));

const RESULT = {
  items: [creatorSummary()],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
  stats: { total: 12, active: 9, good: 5, risk: 3 },
};

describe("CreatorsPage", () => {
  beforeEach(() => {
    fetchCreators.mockResolvedValue(RESULT);
  });

  it("asks for the page the URL describes", async () => {
    render(await CreatorsPage({ searchParams: Promise.resolve({ q: "rangga", page: "2" }) }));

    expect(fetchCreators).toHaveBeenCalledWith({
      q: "rangga",
      contract: "all",
      productivity: "all",
      page: 2,
    });
  });

  it("renders the roster inside the admin shell", async () => {
    render(await CreatorsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Creator Database", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("12 creator")).toBeInTheDocument();
  });

  it("counts the filtered rows against the whole roster", async () => {
    render(await CreatorsPage({ searchParams: Promise.resolve({ q: "rangga" }) }));

    expect(screen.getByText("1 dari 12 creator")).toBeInTheDocument();
  });
});
