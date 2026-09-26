import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SubmissionQueueTable } from "./submission-queue-table";
import type { SubmissionQueueItem } from "@/lib/submissions";

const { fetchDraftPreview, approveSubmission, refresh } = vi.hoisted(() => ({
  fetchDraftPreview: vi.fn(),
  approveSubmission: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/draft-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/draft-preview")>()),
  fetchDraftPreview: (id: string) => fetchDraftPreview(id),
}));

vi.mock("@/lib/draft-review-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/draft-review-actions")>()),
  approveSubmission: (id: string) => approveSubmission(id),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function previewOf(submissionId: string, contentName: string) {
  return {
    submissionId,
    contentName,
    creatorName: "Dimas Putra",
    type: "specific" as const,
    brief: "Tunjukkan fitur jadwal",
    deadline: "2026-09-20",
    status: "draft_revised" as const,
    draftLink: "https://drive.example.com/draft",
    revisions: [],
  };
}

const ITEMS: SubmissionQueueItem[] = [
  {
    submissionId: "111",
    creatorName: "Salsa Wijaya",
    contentName: "Evg_1_Salsa_15Sep2026",
    type: "Evergreen",
    deadline: "2026-09-15",
    status: "draft_review",
  },
  {
    submissionId: "222",
    creatorName: "Dimas Putra",
    contentName: "Product Review iPhone",
    type: "Specific",
    deadline: "2026-09-20",
    status: "draft_revised",
  },
  {
    submissionId: "333",
    creatorName: "Test Unknown",
    contentName: "Unknown Type",
    type: "unknown_type",
    deadline: "2026-09-25",
    status: "draft_review",
  },
];

describe("SubmissionQueueTable", () => {
  it("renders all five columns plus the action column", () => {
    render(<SubmissionQueueTable items={ITEMS} />);

    expect(screen.getByText("Nama Kreator")).toBeInTheDocument();
    expect(screen.getByText("Nama Konten")).toBeInTheDocument();
    expect(screen.getByText("Tipe")).toBeInTheDocument();
    expect(screen.getByText("Deadline")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Aksi")).toBeInTheDocument();
  });

  it("shows creator name, content name, type and formatted deadline", () => {
    render(<SubmissionQueueTable items={[ITEMS[0]]} />);

    expect(screen.getByText("Salsa Wijaya")).toBeInTheDocument();
    expect(screen.getByText("Evg_1_Salsa_15Sep2026")).toBeInTheDocument();
    expect(screen.getByText("Evergreen")).toBeInTheDocument();
    expect(screen.getByText("15 Sep 2026")).toBeInTheDocument();
  });

  it("shows 'Specific' for specific type", () => {
    render(<SubmissionQueueTable items={[ITEMS[1]]} />);

    expect(screen.getByText("Specific")).toBeInTheDocument();
  });

  it("shows 'Draft Menunggu Review' for draft_review status", () => {
    render(<SubmissionQueueTable items={[ITEMS[0]]} />);

    expect(screen.getByText("Draft Menunggu Review")).toBeInTheDocument();
  });

  it("shows 'Draft Revised' for draft_revised status", () => {
    render(<SubmissionQueueTable items={[ITEMS[1]]} />);

    expect(screen.getByText("Draft Revised")).toBeInTheDocument();
  });

  it("falls back to raw type string for unknown types", () => {
    render(<SubmissionQueueTable items={[ITEMS[2]]} />);

    expect(screen.getByText("unknown_type")).toBeInTheDocument();
  });

  it("falls back to the raw status string for unknown statuses", () => {
    render(
      <SubmissionQueueTable
        items={[
          {
            ...ITEMS[0],
            status: "custom_status" as SubmissionQueueItem["status"],
          },
        ]}
      />,
    );

    expect(screen.getByText("custom_status")).toBeInTheDocument();
  });

  it("renders a 'Lihat Detail' button for each row", () => {
    render(<SubmissionQueueTable items={ITEMS} />);

    const buttons = screen.getAllByRole("button", { name: /lihat detail/i });
    expect(buttons).toHaveLength(3);
  });

  it("shows a 'no submissions' message when items is empty", () => {
    render(<SubmissionQueueTable items={[]} />);

    expect(screen.getByText(/tidak ada draft/i)).toBeInTheDocument();
  });

  it("has no placeholder text left in the action column", () => {
    render(<SubmissionQueueTable items={ITEMS} />);

    expect(screen.queryByText(/TODO/)).not.toBeInTheDocument();
  });

  it("opens the Draft Preview of the row whose Lihat Detail was clicked", async () => {
    fetchDraftPreview.mockResolvedValue(previewOf("222", "Product Review iPhone"));
    render(<SubmissionQueueTable items={ITEMS} />);

    fireEvent.click(screen.getAllByRole("button", { name: /lihat detail/i })[1]);

    const dialog = await screen.findByRole("dialog");
    expect(fetchDraftPreview).toHaveBeenCalledWith("222");
    expect(dialog).toHaveTextContent("Product Review iPhone");
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minta Revisi" })).toBeInTheDocument();
  });

  it("closes the Draft Preview from Tutup", async () => {
    fetchDraftPreview.mockResolvedValue(previewOf("111", "Evg_1_Salsa_15Sep2026"));
    render(<SubmissionQueueTable items={ITEMS} />);

    fireEvent.click(screen.getAllByRole("button", { name: /lihat detail/i })[0]);
    await screen.findByRole("button", { name: "Approve" });
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the Draft Preview and refreshes the queue once the draft is approved", async () => {
    fetchDraftPreview.mockResolvedValue(previewOf("111", "Evg_1_Salsa_15Sep2026"));
    approveSubmission.mockResolvedValue(undefined);
    render(<SubmissionQueueTable items={ITEMS} />);

    fireEvent.click(screen.getAllByRole("button", { name: /lihat detail/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(approveSubmission).toHaveBeenCalledWith("111");
    expect(refresh).toHaveBeenCalled();
  });
});
