import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { MyTask } from "@/lib/my-tasks";
import { MyTaskBoard as Board } from "./my-task-board";

const { refresh, replace } = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));

// The address bar is the jsdom location, so a quiet write and the router agree on it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => "/creator/tasks",
}));

/** The board on Semua, nearest deadline first, with nothing filtered unless a test says so. */
function MyTaskBoard(props: Readonly<Partial<ComponentProps<typeof Board>> & { tasks: MyTask[] }>) {
  return <Board tab="all" sort="asc" filtered={false} {...props} />;
}

const { fetchContentDetail } = vi.hoisted(() => ({
  fetchContentDetail: vi.fn(),
}));

vi.mock("@/lib/content-detail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-detail")>()),
  fetchContentDetail: (id: string, role: "admin" | "creator") =>
    fetchContentDetail(id, role),
}));

function task(overrides: Partial<MyTask> = {}): MyTask {
  return {
    platforms: [],
    id: "content-1",
    name: "Evg_1_RanggaPratama_12102026",
    type: "evergreen",
    brief: "",
    deadline: "2026-10-12",
    status: "scheduled",
    tags: [],
    actions: ["submit_draft"],
    revisionNotes: null,
    revisionNotesUpdatedAt: null,
    ...overrides,
  };
}

describe("MyTaskBoard", () => {
  beforeEach(() => {
    refresh.mockClear();
    replace.mockClear();
    window.history.pushState({}, "", "/creator/tasks");
  });

  // A draft or a link is handed in from Detail Konten, not from a button on the row.
  it("puts no hand-in buttons on the rows", () => {
    render(
      <MyTaskBoard
        tasks={[
          task(),
          task({ id: "b", status: "draft_revision", actions: ["resubmit_draft"] }),
          task({ id: "c", status: "draft_approved", actions: ["submit_video"] }),
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /^(Submit|Resubmit|Detail)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["all", "Belum ada task."],
    ["action", "Tidak ada yang perlu dikerjakan."],
    ["waiting", "Tidak ada yang menunggu Admin."],
    ["done", "Belum ada task selesai."],
  ] as const)("says what an empty %s tab means", (tab, message) => {
    render(<MyTaskBoard tasks={[]} tab={tab} />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset filter" })).not.toBeInTheDocument();
  });

  // Seen in the browser: an empty Selesai told the creator new tasks would appear there.
  it.each([
    ["all", true],
    ["action", true],
    ["waiting", false],
    ["done", false],
  ] as const)("on an empty %s tab, says new tasks arrive here only where they do (%s)", (tab, hinted) => {
    render(<MyTaskBoard tasks={[]} tab={tab} />);

    const hint = screen.queryByText("Tugas baru muncul di sini begitu admin menjadwalkannya.");
    if (hinted) expect(hint).toBeInTheDocument();
    else expect(hint).not.toBeInTheDocument();
  });

  // An empty filtered list is never a dead end: the way back sits where the rows would be.
  it("says the filter matched nothing and offers to clear it, keeping the tab", () => {
    window.history.pushState({}, "", "/creator/tasks?tab=action&q=serum&overdue=yes&sort=desc");
    render(<MyTaskBoard tasks={[]} tab="action" filtered />);

    expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
    expect(screen.getByText("Longgarkan pencarian atau filternya.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));

    expect(replace).toHaveBeenCalledWith("/creator/tasks?tab=action", { scroll: false });
  });

  it("clears a filter on Semua back to the bare address", () => {
    window.history.pushState({}, "", "/creator/tasks?q=serum");
    render(<MyTaskBoard tasks={[]} filtered />);

    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));

    expect(replace).toHaveBeenCalledWith("/creator/tasks", { scroll: false });
  });

  it.each(["action", "done"] as const)("has no Aksi column on the %s tab", (tab) => {
    render(<MyTaskBoard tasks={[task()]} tab={tab} />);

    expect(screen.queryByRole("columnheader", { name: "Aksi" })).not.toBeInTheDocument();
  });

  it("names the region the tabs switch", () => {
    render(<MyTaskBoard tasks={[task()]} />);

    expect(screen.getByRole("tabpanel", { name: "Daftar Tugas Saya" })).toHaveAttribute(
      "id",
      "my-task-list",
    );
  });
});

describe("MyTaskBoard deadline sort", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("shows the nearest deadline first by default, and says so to a screen reader", () => {
    window.history.pushState({}, "", "/creator/tasks");
    render(<MyTaskBoard tasks={[task()]} />);

    expect(screen.getByRole("columnheader", { name: /Deadline/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("turns to the furthest deadline first on a press, keeping the filters and dropping the page", () => {
    window.history.pushState({}, "", "/creator/tasks?tab=action&type=specific&page=2");
    render(<MyTaskBoard tasks={[task()]} tab="action" />);

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(replace).toHaveBeenCalledWith("/creator/tasks?tab=action&type=specific&sort=desc", {
      scroll: false,
    });
  });

  // Below lg the rows stack into cards and the header row is only read aloud, so the sort
  // needs its own visible control there.
  it("offers the sort as its own button where the header row is hidden on small screens", () => {
    window.history.pushState({}, "", "/creator/tasks");
    render(<MyTaskBoard tasks={[task()]} />);

    const mobile = screen.getByRole("button", { name: "Urutkan deadline: terdekat dulu" });
    expect(mobile).toHaveTextContent("Terdekat dulu");
    expect(mobile.parentElement?.className).toContain("lg:hidden");
    fireEvent.click(mobile);

    expect(replace).toHaveBeenCalledWith("/creator/tasks?sort=desc", { scroll: false });
  });

  it("names the furthest-first order on the small-screen button too", () => {
    window.history.pushState({}, "", "/creator/tasks?sort=desc");
    render(<MyTaskBoard tasks={[task()]} sort="desc" />);

    expect(screen.getByRole("button", { name: "Urutkan deadline: terjauh dulu" })).toHaveTextContent(
      "Terjauh dulu",
    );
  });

  it("offers no sort on an empty list, where there is nothing to order", () => {
    render(<MyTaskBoard tasks={[]} />);

    expect(screen.queryByRole("button", { name: /Urutkan deadline/ })).not.toBeInTheDocument();
  });

  it("turns back to the default, which leaves the address bare", () => {
    window.history.pushState({}, "", "/creator/tasks?sort=desc");
    render(<MyTaskBoard tasks={[task()]} sort="desc" />);

    expect(screen.getByRole("columnheader", { name: /Deadline/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(replace).toHaveBeenCalledWith("/creator/tasks", { scroll: false });
  });
});

describe("MyTaskBoard content detail panel", () => {
  beforeEach(() => {
    refresh.mockClear();
    replace.mockClear();
    fetchContentDetail.mockReset();
    window.history.pushState({}, "", "/creator/tasks");
  });

  function panelDetail() {
    return {
      id: "content-1",
      name: "Evg_1_RanggaPratama_12102026",
      type: "evergreen" as const,
      brief: "",
      // Far ahead, so the link reads as the H-1 route whatever day the test runs.
      deadline: "2099-12-31",
      status: "draft_review" as const,
      creatorName: "Rangga Pratama",
      tags: [],
      waitingOn: "creator" as const,
      latestSubmissionId: null,
      creatorActions: ["submit_video"] as const,
      events: [],
    };
  }

  it("opens the content detail panel from a row, as the creator", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "creator");
  });

  it("opens a sent link's form from its card's pencil, inside the panel", async () => {
    fetchContentDetail.mockResolvedValue({
      ...panelDetail(),
      status: "link_submitted" as const,
      waitingOn: null,
      creatorActions: [],
      links: [
        {
          platform: "instagram",
          url: "https://www.instagram.com/reel/C8abc12345/",
          submittedAt: "2026-10-18",
          performance: {
            platform: "instagram",
            url: "https://www.instagram.com/reel/C8abc12345/",
            views: null,
            likes: null,
            comments: null,
            shares: null,
            state: "waiting",
            lastSyncedAt: null,
            manualAt: null,
          },
        },
      ],
    });
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ubah link Instagram" }));

    expect(await screen.findByRole("textbox", { name: "Link Instagram" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("opens the submit form inside the panel instead of closing it for another dialog", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link (H-1)" }));

    expect(await screen.findByRole("textbox", { name: "Link TikTok" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Evg_1_RanggaPratama_12102026" })).toBeInTheDocument();
  });

  // A link can name a content the open tab or page does not list; its button has to work too.
  it("hands in a content the list does not hold, since the panel brings everything it needs", async () => {
    window.history.pushState({}, "", "/creator/tasks?tab=done&content=content-9");
    fetchContentDetail.mockResolvedValue({
      ...panelDetail(),
      id: "content-9",
      name: "Konten dari tautan",
      status: "draft_approved" as const,
    });

    render(<MyTaskBoard tasks={[task()]} tab="done" />);
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link Video" }));

    expect(await screen.findByRole("textbox", { name: "Link Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Konten dari tautan" })).toBeInTheDocument();
  });

  it("keeps ?content= in the address while a hand-in is open, since the panel has not closed", async () => {
    window.history.pushState({}, "", "/creator/tasks?content=content-1");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link (H-1)" }));

    expect(await screen.findByRole("textbox", { name: "Link TikTok" })).toBeInTheDocument();
    expect(window.location.search).toBe("?content=content-1");
  });

  it("opens the panel straight from a ?content= link, the way a notification would", async () => {
    window.history.pushState({}, "", "/creator/tasks?content=content-1");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "creator");
  });

  it("drops ?content= from the address once the panel closes, keeping the other filters", async () => {
    window.history.pushState({}, "", "/creator/tasks?status=scheduled&content=content-1&page=2");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tutup" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(window.location.pathname).toBe("/creator/tasks");
    expect(window.location.search).toBe("?status=scheduled&page=2");
  });

  it("puts the opened content in the address, so the panel can be shared or reopened as a link", async () => {
    window.history.pushState({}, "", "/creator/tasks?status=scheduled&page=2");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(window.location.search).toBe("?status=scheduled&page=2&content=content-1");

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(window.location.search).toBe("?status=scheduled&page=2");
  });

  it("replaces the address rather than adding history, so Back leaves the page instead of reopening", async () => {
    window.history.pushState({}, "", "/creator/tasks");
    const pushState = vi.spyOn(window.history, "pushState");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));

    await screen.findByRole("dialog");
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  // The same race the Content Plan had: a quiet address write would make the router drop a
  // filter change still on its way, so while one is, the link goes out as a navigation.
  it("keeps a filter ticked a moment before a row is opened", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    fireEvent.click(screen.getByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));

    await screen.findByRole("dialog");
    expect(replace).toHaveBeenLastCalledWith("/creator/tasks?sort=desc&content=content-1", {
      scroll: false,
    });
  });

  it("closes the panel from Tutup", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tutup" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

});

describe("MyTaskBoard as a calendar", () => {
  const TODAY = "2026-10-09";
  const CHIP = "Evg_1_RanggaPratama_12102026 · Scheduled";
  /** The table opens a row's panel from its name; the calendar from its chip. */
  const ROW = "Evg_1_RanggaPratama_12102026";

  beforeEach(() => {
    refresh.mockClear();
    fetchContentDetail.mockReset();
    fetchContentDetail.mockResolvedValue({
      id: "content-1",
      name: "Evg_1_RanggaPratama_12102026",
      type: "evergreen" as const,
      brief: "",
      deadline: "2026-10-12",
      status: "scheduled" as const,
      creatorName: "Rangga Pratama",
      tags: [],
      waitingOn: "creator" as const,
      latestSubmissionId: null,
      creatorActions: ["submit_draft"] as const,
      events: [],
    });
    window.history.pushState({}, "", "/creator/tasks?view=calendar");
  });

  it("shows the month calendar in place of the table when it is given today", () => {
    render(<MyTaskBoard tasks={[task()]} calendarToday={TODAY} />);

    expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CHIP })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ROW })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit Draft/ })).not.toBeInTheDocument();
  });

  it("keeps the table when it is given no day", () => {
    render(<MyTaskBoard tasks={[task()]} />);

    expect(screen.queryByRole("heading", { name: "Oktober 2026" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: ROW })).toBeInTheDocument();
  });

  it("opens the content detail panel from a chip, as the creator", async () => {
    render(<MyTaskBoard tasks={[task()]} calendarToday={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: CHIP }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "creator");
  });

  it("puts the content a chip opened in the address, keeping the calendar view", async () => {
    render(<MyTaskBoard tasks={[task()]} calendarToday={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: CHIP }));
    await screen.findByRole("dialog");

    const query = new URLSearchParams(window.location.search);

    expect(query.get("content")).toBe("content-1");
    expect(query.get("view")).toBe("calendar");
  });

  it("opens a hand-in inside the panel, as the table does", async () => {
    fetchContentDetail.mockResolvedValue({
      id: "content-1",
      name: "Evg_1_RanggaPratama_12102026",
      type: "evergreen" as const,
      brief: "",
      deadline: "2099-12-31",
      status: "scheduled" as const,
      creatorName: "Rangga Pratama",
      tags: [],
      waitingOn: "creator" as const,
      latestSubmissionId: null,
      creatorActions: ["submit_draft"] as const,
      events: [],
    });
    render(<MyTaskBoard tasks={[task()]} calendarToday={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: CHIP }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));

    expect(await screen.findByRole("textbox", { name: "Link File Draft" })).toBeInTheDocument();
  });
});
