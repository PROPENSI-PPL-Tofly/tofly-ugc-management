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

// The modals are stubbed: what they do inside is their own tests' business. These stand-ins
// show what the board handed them and expose the two ways a modal hands control back.
interface StubProps {
  content: {
    id: string;
    name: string;
    deadline: string;
    brief?: string;
    revisionNotes?: string | null;
  };
  onClose: () => void;
  onSubmitted: () => void;
  action?: string;
}

function StubModal({ label, props }: Readonly<{ label: string; props: StubProps }>) {
  return (
    <div role="dialog" aria-label={label}>
      <p>{`${props.content.id}|${props.content.name}|${props.content.deadline}`}</p>
      <p>{`action:${props.action ?? "-"}`}</p>
      <p>{`brief:${props.content.brief ?? "-"}|notes:${props.content.revisionNotes ?? "-"}`}</p>
      <button
        type="button"
        onClick={() => {
          props.onSubmitted();
          props.onClose();
        }}
      >
        stub-submitted
      </button>
      <button type="button" onClick={props.onClose}>
        stub-cancel
      </button>
    </div>
  );
}

vi.mock("@/components/my-task/submit-draft-modal", () => ({
  SubmitDraftModal: (props: StubProps) => <StubModal label="draft-modal" props={props} />,
}));

vi.mock("@/components/my-task/submit-video-modal", () => ({
  SubmitVideoModal: (props: StubProps) => <StubModal label="video-modal" props={props} />,
}));

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

describe("MyTaskBoard", () => {
  beforeEach(() => {
    refresh.mockClear();
    replace.mockClear();
    window.history.pushState({}, "", "/creator/tasks");
  });

  it("lets the creator press the actions the table shows", () => {
    render(<MyTaskBoard tasks={[task()]} />);

    expect(screen.getByRole("button", { name: /Submit Draft/ })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the draft modal on the task picked for Submit Draft", () => {
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    const modal = screen.getByRole("dialog", { name: "draft-modal" });
    expect(modal).toHaveTextContent("content-1|Evg_1_RanggaPratama_12102026|2026-10-12");
    expect(modal).toHaveTextContent("action:submit_draft");
  });

  it("opens the same draft modal as a resubmit for Resubmit Draft", () => {
    render(
      <MyTaskBoard tasks={[task({ status: "draft_revision", actions: ["resubmit_draft"] })]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Resubmit Draft/ }));

    expect(screen.getByRole("dialog", { name: "draft-modal" })).toHaveTextContent(
      "action:resubmit_draft",
    );
  });

  it("opens the video modal for Submit Link Video, and only that one", () => {
    render(
      <MyTaskBoard tasks={[task({ status: "draft_approved", actions: ["submit_video"] })]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Submit Link Video/ }));

    expect(screen.getByRole("dialog", { name: "video-modal" })).toHaveTextContent(
      "content-1|Evg_1_RanggaPratama_12102026|2026-10-12",
    );
    expect(screen.queryByRole("dialog", { name: "draft-modal" })).not.toBeInTheDocument();
  });

  it("opens the modal for the row that was pressed", () => {
    render(
      <MyTaskBoard
        tasks={[
          task({ id: "a", name: "Pertama" }),
          task({ id: "b", name: "Kedua", deadline: "2026-10-20" }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit Draft: Kedua" }));

    expect(screen.getByRole("dialog", { name: "draft-modal" })).toHaveTextContent(
      "b|Kedua|2026-10-20",
    );
  });

  // After a hand-in the row's status and buttons change on the server; refreshing re-runs the
  // page's fetch so the table shows them, and the pressed button is gone.
  it("refreshes the list and closes after a successful hand-in", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hands the modals the brief and the admin's revision notes", () => {
    render(
      <MyTaskBoard
        tasks={[
          task({
            status: "draft_revision",
            actions: ["resubmit_draft"],
            brief: "Tunjukkan kemasan",
            revisionNotes: "Perjelas intro",
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Resubmit Draft/ }));

    expect(screen.getByRole("dialog", { name: "draft-modal" })).toHaveTextContent(
      "brief:Tunjukkan kemasan|notes:Perjelas intro",
    );
  });

  it.each<[string, Partial<MyTask>, string]>([
    ["Submit Draft", {}, "Draft terkirim. Admin akan meninjaunya."],
    [
      "Resubmit Draft",
      { status: "draft_revision", actions: ["resubmit_draft"] },
      "Draft terkirim. Admin akan meninjaunya.",
    ],
    [
      "Submit Link Video",
      { status: "draft_approved", actions: ["submit_video"] },
      "Link video terkirim. Konten ini selesai.",
    ],
  ])("confirms a %s hand-in with a toast", (label, overrides, message) => {
    render(<MyTaskBoard tasks={[task(overrides)]} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));

    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("puts focus on the task list after a hand-in, since the pressed button may be gone", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    expect(screen.getByRole("tabpanel", { name: "Daftar Tugas Saya" })).toHaveFocus();
  });

  it("shows no toast when the creator cancels", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-cancel" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lets the creator dismiss the toast", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));
    fireEvent.click(screen.getByRole("button", { name: "stub-submitted" }));

    fireEvent.click(screen.getByRole("button", { name: "Tutup notifikasi" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("closes without refreshing when the creator cancels", () => {
    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    fireEvent.click(screen.getByRole("button", { name: "stub-cancel" }));

    expect(refresh).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));

    expect(replace).toHaveBeenCalledWith("/creator/tasks?tab=action", { scroll: false });
  });

  it("clears a filter on Semua back to the bare address", () => {
    window.history.pushState({}, "", "/creator/tasks?q=serum");
    render(<MyTaskBoard tasks={[]} filtered />);

    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));

    expect(replace).toHaveBeenCalledWith("/creator/tasks", { scroll: false });
  });

  it("drops the Aksi column on Selesai, where nothing is left to do", () => {
    render(<MyTaskBoard tasks={[task({ status: "link_submitted", actions: [] })]} tab="done" />);

    expect(screen.queryByRole("columnheader", { name: "Aksi" })).not.toBeInTheDocument();
  });

  it("keeps the Aksi column on every other tab", () => {
    render(<MyTaskBoard tasks={[task()]} tab="action" />);

    expect(screen.getByRole("columnheader", { name: "Aksi" })).toBeInTheDocument();
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

  it("hands the panel's submit action back to the row's submit modal", async () => {
    fetchContentDetail.mockResolvedValue(panelDetail());
    render(<MyTaskBoard tasks={[task()]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link (H-1)" }));

    expect(await screen.findByRole("dialog", { name: "video-modal" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Detail Konten|Evg_1/ })).toBeNull();
  });

  // A link can name a content the open tab or page does not list; its button has to work too.
  it("opens the submit modal for a content the list does not hold, from what the panel shows", async () => {
    window.history.pushState({}, "", "/creator/tasks?tab=done&content=content-9");
    fetchContentDetail.mockResolvedValue({
      ...panelDetail(),
      id: "content-9",
      name: "Konten dari tautan",
      deadline: "2099-12-31",
      brief: "Brief dari panel",
      status: "draft_approved" as const,
    });

    render(<MyTaskBoard tasks={[task()]} tab="done" />);
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link Video" }));

    const modal = await screen.findByRole("dialog", { name: "video-modal" });
    expect(modal).toHaveTextContent("content-9|Konten dari tautan|2099-12-31");
    expect(modal).toHaveTextContent("brief:Brief dari panel|notes:-");
    expect(window.location.search).toBe("?tab=done");
  });

  it("hands a resubmit from such a link the admin's latest revision note", async () => {
    window.history.pushState({}, "", "/creator/tasks?content=content-9");
    fetchContentDetail.mockResolvedValue({
      ...panelDetail(),
      id: "content-9",
      name: "Konten dari tautan",
      status: "draft_revision" as const,
      creatorActions: ["resubmit_draft"] as const,
      // Newest first, as the API sends them.
      events: [
        {
          id: "e3",
          type: "revision_requested" as const,
          at: "2026-10-09T03:00:00.000Z",
          actor: { name: "Admin", role: "admin" as const },
          payload: { note: "Perbaiki hook" },
        },
        {
          id: "e2",
          type: "draft_submitted" as const,
          at: "2026-10-08T03:00:00.000Z",
          actor: { name: "Rangga Pratama", role: "creator" as const },
          payload: { version: 2, link: "https://drive.google.com/file/d/x" },
        },
        {
          id: "e1",
          type: "revision_requested" as const,
          at: "2026-10-07T03:00:00.000Z",
          actor: { name: "Admin", role: "admin" as const },
          payload: { note: "Catatan lama" },
        },
      ],
    });

    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Resubmit Draft" }));

    const modal = await screen.findByRole("dialog", { name: "draft-modal" });
    expect(modal).toHaveTextContent("action:resubmit_draft");
    expect(modal).toHaveTextContent("notes:Perbaiki hook");
  });

  it("keeps the row's own facts when the list does hold the content", async () => {
    fetchContentDetail.mockResolvedValue({ ...panelDetail(), name: "Nama dari panel" });
    render(<MyTaskBoard tasks={[task({ brief: "Brief dari baris" })]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link (H-1)" }));

    const modal = await screen.findByRole("dialog", { name: "video-modal" });
    expect(modal).toHaveTextContent("content-1|Evg_1_RanggaPratama_12102026|2026-10-12");
    expect(modal).toHaveTextContent("brief:Brief dari baris");
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

  it("drops ?content= too when a command in the panel hands over to the submit modal", async () => {
    window.history.pushState({}, "", "/creator/tasks?content=content-1");
    fetchContentDetail.mockResolvedValue(panelDetail());

    render(<MyTaskBoard tasks={[task()]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Submit Link (H-1)" }));

    expect(await screen.findByRole("dialog", { name: "video-modal" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
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

  it("closes the panel from Tutup without opening any modal", async () => {
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

  it("hands a submit action from the panel to the submit modal, as the table does", async () => {
    render(<MyTaskBoard tasks={[task()]} calendarToday={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: CHIP }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit Draft" }));

    expect(await screen.findByRole("dialog", { name: "draft-modal" })).toBeInTheDocument();
  });
});
