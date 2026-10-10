import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContentDetail } from "@/lib/content-detail";
import type { ContentPlanRow } from "@/lib/content-plan";
import { ContentPlanBoard } from "./content-plan-board";

const { fetchContentDetail, approveSubmission, refresh, replace } = vi.hoisted(() => ({
  fetchContentDetail: vi.fn(),
  approveSubmission: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

let searchParams = new URLSearchParams();

vi.mock("@/lib/content-detail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-detail")>()),
  fetchContentDetail: (id: string, role: "admin" | "creator") =>
    fetchContentDetail(id, role),
}));

vi.mock("@/lib/draft-review-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/draft-review-actions")>()),
  approveSubmission: (id: string) => approveSubmission(id),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => "/admin/content-plan",
  useSearchParams: () => searchParams,
}));

const ROW: ContentPlanRow = {
  contentId: "content-1",
  name: "Evg_1_Salsa_15Sep2026",
  creatorId: "id-1",
  creatorName: "Salsa Wijaya",
  type: "evergreen",
  deadline: "2026-09-15",
  status: "draft_review",
  tags: [],
  revisionCount: 0,
};

function detailOf(): ContentDetail {
  return {
    id: "content-1",
    name: "Evg_1_Salsa_15Sep2026",
    type: "evergreen",
    brief: "",
    deadline: "2026-09-15",
    status: "draft_review",
    creatorName: "Salsa Wijaya",
    tags: [],
    waitingOn: "admin",
    latestSubmissionId: "111",
    creatorActions: [],
    events: [
      {
        id: "content-1:scheduled",
        type: "scheduled",
        at: "2026-09-01T03:00:00.000Z",
        actor: { name: null, role: "admin" },
      },
    ],
  };
}

function renderBoard(sort: "asc" | "desc" = "desc") {
  render(
    <ContentPlanBoard
      items={[ROW]}
      filtered={false}
      tab="all"
      sort={sort}
    />,
  );
}

describe("ContentPlanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    window.history.replaceState({}, "", "/admin/content-plan");
  });

  it("opens the panel from a row and puts the content in the address", async () => {
    fetchContentDetail.mockResolvedValue(detailOf());
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Tinjau Evg_1_Salsa_15Sep2026" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "admin");
    expect(window.location.search).toBe("?content=content-1");
  });

  it("opens the panel straight from a ?content= link, the way a notification would", async () => {
    window.history.pushState({}, "", "/admin/content-plan?tab=action&content=content-1");
    fetchContentDetail.mockResolvedValue(detailOf());

    renderBoard();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "admin");
  });

  it("drops ?content= on close, keeping the other parameters", async () => {
    window.history.pushState({}, "", "/admin/content-plan?tab=waiting&content=content-1&page=2");
    fetchContentDetail.mockResolvedValue(detailOf());

    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: "Tutup" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.search).toBe("?tab=waiting&page=2");
  });

  it("confirms a decision with a toast, closes the panel and refreshes the list", async () => {
    fetchContentDetail.mockResolvedValue(detailOf());
    approveSubmission.mockResolvedValue(undefined);
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Tinjau Evg_1_Salsa_15Sep2026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(approveSubmission).toHaveBeenCalledWith("111");
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Draft di-approve. Kreator bisa kirim link video.",
    );
  });

  it("turns the deadline sort over in the URL, dropping the old page number", () => {
    searchParams = new URLSearchParams({ tab: "action", page: "3" });
    renderBoard("desc");

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(replace).toHaveBeenCalledWith("/admin/content-plan?tab=action&sort=asc", {
      scroll: false,
    });
  });

  it("takes the sort back out of the URL when it returns to the farthest-first default", () => {
    searchParams = new URLSearchParams({ sort: "asc", tab: "waiting" });
    renderBoard("asc");

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(replace).toHaveBeenCalledWith("/admin/content-plan?tab=waiting", {
      scroll: false,
    });
  });
});
