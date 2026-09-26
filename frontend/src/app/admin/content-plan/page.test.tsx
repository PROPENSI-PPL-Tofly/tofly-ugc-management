import { render, screen, within } from "@testing-library/react";
import { fetchSubmissionQueue, type SubmissionQueueResponse } from "@/lib/submissions";
import ContentPlanAllPage from "./page";

vi.mock("@/lib/submissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/submissions")>();
  return { ...actual, fetchSubmissionQueue: vi.fn() };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/content-plan",
}));

const mockedFetch = vi.mocked(fetchSubmissionQueue);

function queueOf(total: number): SubmissionQueueResponse {
  return { items: [], page: 1, pageSize: 10, total, totalPages: Math.ceil(total / 10) };
}

/** Answers the whole queue with `waiting` and the resubmitted slice with `resubmitted`. */
function queueCounts(waiting: number, resubmitted: number) {
  mockedFetch.mockImplementation(async (_page, filters) =>
    queueOf(filters?.status === "draft_revised" ? resubmitted : waiting),
  );
}

async function renderPage() {
  render(await ContentPlanAllPage());
}

function draftQueueEntry() {
  return screen.getByRole("region", { name: "Antrian Draft" });
}

describe("Content Plan (All) page", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("is titled Content Plan (All) and lists what waits for a decision", async () => {
    queueCounts(0, 0);

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Content Plan (All)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Perlu keputusan" })).toBeInTheDocument();
  });

  it("counts every draft waiting and the resubmitted ones from the review queue", async () => {
    queueCounts(22, 2);

    await renderPage();

    expect(mockedFetch).toHaveBeenCalledWith(1, {});
    expect(mockedFetch).toHaveBeenCalledWith(1, { status: "draft_revised" });
    expect(within(draftQueueEntry()).getByText("22 draft menunggu review")).toBeInTheDocument();
    expect(
      within(draftQueueEntry()).getByRole("link", { name: "2 dikirim ulang" }),
    ).toHaveAttribute("href", "/admin/submissions?status=draft_revised");
  });

  it("opens the draft queue from its entry", async () => {
    queueCounts(22, 2);

    await renderPage();

    expect(
      within(draftQueueEntry()).getByRole("link", { name: "Buka Antrian Draft" }),
    ).toHaveAttribute("href", "/admin/submissions");
  });

  it("says the queue is clear and leaves out the resubmitted line when nothing waits", async () => {
    queueCounts(0, 0);

    await renderPage();

    expect(
      within(draftQueueEntry()).getByText("Tidak ada draft yang menunggu review"),
    ).toBeInTheDocument();
    expect(within(draftQueueEntry()).queryByText(/dikirim ulang/)).not.toBeInTheDocument();
    expect(
      within(draftQueueEntry()).getByRole("link", { name: "Buka Antrian Draft" }),
    ).toBeInTheDocument();
  });

  it("still offers the queue when the count cannot be loaded", async () => {
    mockedFetch.mockRejectedValue(new Error("backend down"));

    await renderPage();

    expect(
      within(draftQueueEntry()).getByText("Jumlah draft belum bisa dimuat."),
    ).toBeInTheDocument();
    expect(
      within(draftQueueEntry()).getByRole("link", { name: "Buka Antrian Draft" }),
    ).toHaveAttribute("href", "/admin/submissions");
  });
});
