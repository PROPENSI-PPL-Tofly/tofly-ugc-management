import { render, screen, within } from "@testing-library/react";
import { fetchCreatorDashboard, type CreatorDashboard } from "@/lib/creator-dashboard.server";
import { MyTasksError, type MyTask } from "@/lib/my-tasks";
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
    overdue: { items: [], total: 0 },
    upcoming: { items: [], total: 0 },
    ...overrides,
  };
}

function task(overrides: Partial<MyTask> = {}): MyTask {
  return {
    id: "content-1",
    name: "Evg_1_RanggaPratama_12102026",
    type: "evergreen",
    brief: "",
    deadline: "2026-10-12",
    status: "scheduled",
    tags: [],
    actions: ["submit_draft"],
    revisionNotes: null,
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
    // The cards count every open task, whatever month it is due in.
    expect(screen.getByText("Berikut ringkasan task yang perlu kamu kerjakan.")).toBeInTheDocument();
    expect(screen.queryByText(/bulan ini/)).not.toBeInTheDocument();
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

  // Under the cards, what to work on next: what is late, then what falls due in the next 14 days,
  // each task one press from its detail on Task Saya.
  describe("the deadline agenda", () => {
    const upcoming = () => screen.getByRole("region", { name: /Deadline 14 hari ke depan/ });

    it("lists the next 14 days' deadlines with the date, days left and status, each leading to its task", async () => {
      mockedFetch.mockResolvedValue(
        dashboard({
          upcoming: {
            items: [
              task({ id: "a", name: "Review serum", deadline: "2026-10-09", status: "draft_revision" }),
              task({ id: "b", name: "Unboxing botol", deadline: "2026-10-12", type: "specific" }),
            ],
            total: 2,
          },
        }),
      );

      await renderPage();

      const rows = within(upcoming()).getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent("Review serum");
      expect(rows[0]).toHaveTextContent("Hari ini");
      expect(rows[0]).toHaveTextContent("Draft Perlu Revisi");
      expect(rows[1]).toHaveTextContent("Unboxing botol");
      expect(rows[1]).toHaveTextContent("Specific");
      expect(rows[1]).toHaveTextContent("12 Okt 2026");
      expect(rows[1]).toHaveTextContent("H-3");
      expect(within(rows[1]).getByRole("link")).toHaveAttribute("href", "/creator/tasks?content=b");
    });

    it("puts overdue work first, saying how late each task is", async () => {
      mockedFetch.mockResolvedValue(
        dashboard({
          overdue: {
            items: [task({ id: "late", name: "Haul kemasan", deadline: "2026-10-07", tags: ["overdue"] })],
            total: 1,
          },
          upcoming: { items: [task()], total: 1 },
        }),
      );

      await renderPage();

      const late = screen.getByRole("region", { name: /Overdue/ });
      expect(within(late).getByRole("listitem")).toHaveTextContent("Lewat 2 hari");
      // Overdue comes before the next 14 days in reading order.
      expect(late.compareDocumentPosition(upcoming()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("leaves the overdue section out while nothing is late", async () => {
      mockedFetch.mockResolvedValue(dashboard());

      await renderPage();

      expect(screen.queryByRole("region", { name: /Overdue/ })).not.toBeInTheDocument();
    });

    it("says so when nothing falls due in the next 14 days", async () => {
      mockedFetch.mockResolvedValue(dashboard());

      await renderPage();

      expect(upcoming()).toHaveTextContent("Tidak ada deadline dalam 14 hari ke depan.");
      expect(within(upcoming()).queryByRole("listitem")).not.toBeInTheDocument();
    });

    it("counts the whole list in its heading and leads to all of it on Task Saya when it shows only part", async () => {
      mockedFetch.mockResolvedValue(dashboard({ upcoming: { items: [task()], total: 8 } }));

      await renderPage();

      expect(within(upcoming()).getByRole("heading")).toHaveTextContent("8");
      const all = within(upcoming()).getByRole("link", { name: "Lihat semua 8 di Task Saya" });
      const query = new URL(all.getAttribute("href") ?? "", "http://x").searchParams;
      expect(Object.fromEntries(query)).toEqual({
        status: "scheduled,draft_review,draft_revision,draft_approved",
        overdue: "no",
        period: "custom",
        from: "2026-10-09",
        to: "2026-10-23",
      });
    });

    it("leads to every overdue task on Task Saya when it shows only part of them", async () => {
      mockedFetch.mockResolvedValue(
        dashboard({ overdue: { items: [task({ tags: ["overdue"] })], total: 6 } }),
      );

      await renderPage();

      const all = screen.getByRole("link", { name: "Lihat semua 6 di Task Saya" });
      const query = new URL(all.getAttribute("href") ?? "", "http://x").searchParams;
      expect(Object.fromEntries(query)).toEqual({
        status: "scheduled,draft_review,draft_revision,draft_approved",
        overdue: "yes",
      });
    });

    it("offers no such link when every task is already shown", async () => {
      mockedFetch.mockResolvedValue(dashboard({ upcoming: { items: [task()], total: 1 } }));

      await renderPage();

      expect(screen.queryByRole("link", { name: /^Lihat semua/ })).not.toBeInTheDocument();
    });
  });
});
