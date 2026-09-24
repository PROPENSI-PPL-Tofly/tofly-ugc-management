import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { CreatorDetailModal } from "./creator-detail-modal";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
}));

const creatorDetail = {
  id: "creator-rangga",
  name: "Rangga Pratama",
  email: "rangga@example.com",
  socials: {
    instagram: "rangga.creates",
    tiktok: "ranggacreates",
  },
  accessRevokeDate: null,
  phoneNumber: "081234567001",
  contract: {
    status: "active" as const,
    startDate: "2026-06-10",
    endDate: "2026-12-07",
    daysRemaining: 80,
    periodNumber: 1,
    contentQuota: 6,
  },
  progress: {
    submitted: 1,
    total: 2,
    percent: 50,
  },
  performance: {
    onTimeRate: 100,
    avgRevisions: 1,
    productivity: "good" as const,
    productivityLabel: "Baik",
  },
  contractHistory: [
    {
      id: "contract-1",
      periodNumber: 1,
      startDate: "2026-06-10",
      endDate: "2026-12-07",
      daysBetween: 180,
      contentQuota: 6,
      completed: 1,
      total: 2,
      isCurrent: true,
    },
  ],
  contents: [
    {
      id: "content-1",
      name: "Evergreen - Tips Belajar Cepat",
      type: "evergreen",
      deadline: "2026-09-30",
      status: "link_submitted",
      outcome: "on_time" as const,
      videoLink: "https://example.com/video",
    },
  ],
  drafts: [
    {
      contentId: "content-1",
      contentName: "Evergreen - Tips Belajar Cepat",
      revisionCount: 1,
      latestLink: "https://example.com/draft",
      lastSubmittedAt: "2026-09-20",
    },
  ],
};

function open(extra: Partial<ComponentProps<typeof CreatorDetailModal>> = {}) {
  render(
    <CreatorDetailModal
      creatorId="creator-rangga"
      name="Rangga Pratama"
      onClose={vi.fn()}
      {...extra}
    />,
  );
}

describe("CreatorDetailModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("shows a loading state before the detail response arrives", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));

    open();

    expect(screen.getByText(/memuat detail creator/i)).toBeInTheDocument();
  });

  it("shows creator details after a successful response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(creatorDetail)));

    open();

    expect(await screen.findByText("rangga@example.com")).toBeInTheDocument();

    expect(screen.getByText("081234567001")).toBeInTheDocument();

    const revisionField = screen.getByText("Avg revisi").parentElement;

    expect(revisionField).not.toBeNull();
    expect(revisionField).toHaveTextContent("1x");

    expect(screen.getAllByText("Evergreen - Tips Belajar Cepat")).toHaveLength(2);

    expect(screen.getByText("Tepat waktu")).toBeInTheDocument();
  });

  it("requests the selected creator detail from the API", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(creatorDetail)));

    open();

    await screen.findByText("rangga@example.com");

    expect(fetchSpy).toHaveBeenCalledWith("/api/creators/creator-rangga", {
      cache: "no-store",
    });
  });

  it("shows an error when the detail request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    open();

    expect(await screen.findByText(/gagal memuat detail creator/i)).toBeInTheDocument();
  });

  it("shows fallback values when optional information is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...creatorDetail,
          phoneNumber: null,
          socials: {},
        }),
      ),
    );

    open();

    expect(await screen.findByText("rangga@example.com")).toBeInTheDocument();

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("handles a creator with no content or drafts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...creatorDetail,
          contents: [],
          drafts: [],
        }),
      ),
    );

    open();

    expect(await screen.findByText(/belum ada konten pada periode ini/i)).toBeInTheDocument();

    expect(screen.getByText(/belum ada draft yang dikirim/i)).toBeInTheDocument();
  });

  it("does not update after the component is unmounted", async () => {
    let resolve: (response: Response) => void = () => {};

    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((promiseResolve) => {
          resolve = promiseResolve;
        }),
    );

    const { unmount } = render(
      <CreatorDetailModal creatorId="creator-rangga" name="Rangga Pratama" onClose={vi.fn()} />,
    );

    unmount();

    resolve(new Response(JSON.stringify(creatorDetail)));

    await Promise.resolve();

    expect(screen.queryByText("rangga@example.com")).not.toBeInTheDocument();
  });

  it("does not show a failure after the component is unmounted", async () => {
    let reject: (error: unknown) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((_, promiseReject) => (reject = promiseReject)),
    );

    const { unmount } = render(
      <CreatorDetailModal creatorId="creator-rangga" name="Rangga Pratama" onClose={vi.fn()} />,
    );
    unmount();
    reject(new Error("late"));
    await Promise.resolve();

    expect(screen.queryByText(/gagal memuat detail creator/i)).not.toBeInTheDocument();
  });

  it.each([
    ["risk", "Berisiko", "text-red-ink"],
    ["watch", "Perlu Perhatian", "text-amber-ink"],
    ["no_data", "Belum Ada Data", "text-ink-2"],
  ] as const)("colours a %s productivity band by its judgement", async (productivity, label, tone) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...creatorDetail,
          performance: { ...creatorDetail.performance, productivity, productivityLabel: label },
        }),
      ),
    );

    open();

    expect(await screen.findByText(label)).toHaveClass(tone);
  });

  // Content still in progress shows where it is in the workflow, starting at Scheduled.
  it.each([
    ["scheduled", "Scheduled"],
    ["draft_review", "Draft Menunggu Review"],
    ["draft_revision", "Draft Perlu Revisi"],
    ["draft_revised", "Draft Revised"],
    ["draft_approved", "Draft Approved"],
  ] as const)("shows open %s content by its workflow status", async (status, label) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...creatorDetail,
          contents: [{ ...creatorDetail.contents[0], status, outcome: "open" }],
        }),
      ),
    );

    open();

    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText("Berjalan")).not.toBeInTheDocument();
  });

  describe("content history paging", () => {
    const contents = Array.from({ length: 12 }, (_, index) => ({
      ...creatorDetail.contents[0],
      id: `content-${index + 1}`,
      name: `Konten ${index + 1}`,
    }));

    function previous() {
      return screen.getByRole("button", { name: "Riwayat konten sebelumnya" });
    }

    function next() {
      return screen.getByRole("button", { name: "Riwayat konten berikutnya" });
    }

    beforeEach(() => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ...creatorDetail, contents, drafts: [] })),
      );
    });

    it("shows five contents at a time, starting on the first page", async () => {
      open();

      expect(await screen.findByText("Konten 1")).toBeInTheDocument();
      expect(screen.getByText("Konten 5")).toBeInTheDocument();
      expect(screen.queryByText("Konten 6")).not.toBeInTheDocument();
      expect(screen.getByText("1–5 dari 12")).toBeInTheDocument();
      expect(previous()).toBeDisabled();
      expect(next()).toBeEnabled();
    });

    it("steps forward to the last page and back again", async () => {
      open();
      await screen.findByText("Konten 1");

      fireEvent.click(next());
      expect(screen.getByText("Konten 6")).toBeInTheDocument();
      expect(screen.queryByText("Konten 1")).not.toBeInTheDocument();

      fireEvent.click(next());
      expect(screen.getByText("11–12 dari 12")).toBeInTheDocument();
      expect(next()).toBeDisabled();

      fireEvent.click(previous());
      expect(screen.getByText("6–10 dari 12")).toBeInTheDocument();
    });
  });

  it("shows no paging controls when every content fits on one page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(creatorDetail)));

    open();

    await screen.findByText("rangga@example.com");
    expect(screen.queryByRole("button", { name: /riwayat konten/i })).not.toBeInTheDocument();
  });

  it("says so when there is no contract history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...creatorDetail, contractHistory: [] })),
    );

    open();

    expect(await screen.findByText(/belum ada riwayat kontrak/i)).toBeInTheDocument();
  });

  it("marks only the running period in the contract history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...creatorDetail,
          contractHistory: [
            { ...creatorDetail.contractHistory[0], id: "contract-0", isCurrent: false, completed: 6, total: 6 },
          ],
        }),
      ),
    );

    open();

    expect(await screen.findByText("6/6 selesai")).toBeInTheDocument();
    expect(screen.queryByText(/berjalan/)).not.toBeInTheDocument();
  });

  it("navigates to the creator Content Plan", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(creatorDetail)));

    open();

    const button = await screen.findByRole("button", {
      name: /lihat content plan/i,
    });

    fireEvent.click(button);

    expect(push).toHaveBeenCalledWith("/admin/creators/creator-rangga/content-plan");
  });

  it("calls onClose when Tutup is clicked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(creatorDetail)));

    const onClose = vi.fn();

    open({ onClose });

    const button = await screen.findByRole("button", {
      name: "Tutup",
    });

    fireEvent.click(button);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
