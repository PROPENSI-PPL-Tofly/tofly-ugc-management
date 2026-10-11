import { render, screen, within } from "@testing-library/react";
import { fetchCreatorDashboard, type CreatorDashboard } from "@/lib/creator-dashboard.server";
import { MyTasksError } from "@/lib/my-tasks";
import CreatorDashboardPage from "./page";

vi.mock("@/lib/creator-dashboard.server", () => ({
  fetchCreatorDashboard: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/dashboard",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const mockedFetch = vi.mocked(fetchCreatorDashboard);

function dashboard(overrides: Partial<CreatorDashboard> = {}): CreatorDashboard {
  return {
    counts: { scheduled: 3, draft_revision: 1, draft_approved: 2 },
    nearestDeadline: "2026-10-12",
    ...overrides,
  };
}

async function renderPage() {
  return render(<>{await CreatorDashboardPage()}</>);
}

describe("Creator dashboard page", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    // Midday in Jakarta on 9 Oct 2026, so "today" is the same day whatever zone the test runs in.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T05:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens in the creator frame under the Dashboard title", async () => {
    mockedFetch.mockResolvedValue(dashboard());

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Berikut ringkasan task kamu bulan ini.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
  });

  it.each([
    ["Draft Perlu Disubmit", "3"],
    ["Draft Perlu Direvisi", "1"],
    ["Link Konten Perlu Diupload", "2"],
  ])("shows the count the loader read for %s", async (label, count) => {
    mockedFetch.mockResolvedValue(dashboard());

    await renderPage();

    expect(
      within(screen.getByRole("link", { name: new RegExp(label) })).getByText(count),
    ).toBeInTheDocument();
  });

  it("words the nearest deadline as the days left from today", async () => {
    mockedFetch.mockResolvedValue(dashboard({ nearestDeadline: "2026-10-12" }));

    await renderPage();

    expect(screen.getByText("3 hari lagi")).toBeInTheDocument();
  });

  it("says how late the nearest deadline is once it has passed", async () => {
    mockedFetch.mockResolvedValue(dashboard({ nearestDeadline: "2026-10-07" }));

    await renderPage();

    expect(screen.getByText("Lewat 2 hari")).toBeInTheDocument();
    expect(screen.queryByText("0 hari lagi")).not.toBeInTheDocument();
  });

  it("shows a dash for the nearest deadline when nothing is open", async () => {
    mockedFetch.mockResolvedValue(dashboard({ nearestDeadline: null }));

    await renderPage();

    const cards = screen.getAllByRole("listitem").filter((item) =>
      item.textContent?.includes("Deadline Terdekat"),
    );

    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("—")).toBeInTheDocument();
  });

  it("tells a visitor who is not signed in as a creator, instead of empty cards", async () => {
    mockedFetch.mockRejectedValue(new MyTasksError(401));

    await renderPage();

    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Kamu belum masuk sebagai creator.");
    expect(within(alert).getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText("Draft Perlu Disubmit")).not.toBeInTheDocument();
  });

  it.each([
    ["a server error", new MyTasksError(500)],
    ["a network failure", new TypeError("fetch failed")],
  ])("offers a reload after %s, instead of cards showing zeros that are not true", async (_label, error) => {
    mockedFetch.mockRejectedValue(error);

    await renderPage();

    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Dashboard tidak bisa dimuat.");
    expect(within(alert).getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/creator/dashboard",
    );
    expect(screen.queryByText("Draft Perlu Disubmit")).not.toBeInTheDocument();
  });
});
