import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DraftPreview } from "@/lib/draft-preview";
import { DraftPreviewModal } from "./draft-preview-modal";
import { ReviewActions } from "./review-actions";

const { approveSubmission, refresh } = vi.hoisted(() => ({
  approveSubmission: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/draft-review-actions", () => ({
  DraftReviewActionError: class extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "DraftReviewActionError";
    }
  },
  approveSubmission: (...args: unknown[]) => approveSubmission(...args),
  reviseSubmission: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const PREVIEW: DraftPreview = {
  submissionId: "sub-2",
  contentName: "Promo Lebaran",
  creatorName: "Rangga Pratama",
  type: "specific",
  brief: "Tunjukkan fitur cashback.",
  deadline: "2026-10-05",
  status: "draft_review",
  draftLink: "https://drive.google.com/file/d/draft-2",
  revisions: [],
};

describe("DraftPreviewModal with ReviewActions", () => {
  beforeEach(() => {
    approveSubmission.mockReset();
    refresh.mockReset();
  });

  it("keeps the decision buttons hidden until the draft has loaded", () => {
    render(
      <DraftPreviewModal
        submissionId="sub-2"
        onClose={vi.fn()}
        load={() => new Promise(() => {})}
        actions={<ReviewActions submissionId="sub-2" onDecided={vi.fn()} />}
      />,
    );

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Minta Revisi" })).not.toBeInTheDocument();
    expect(screen.getByText("Memuat draft...")).toBeInTheDocument();
  });

  it("approves from the modal footer and reports the decision upward", async () => {
    approveSubmission.mockResolvedValue(undefined);
    const onDecided = vi.fn();

    render(
      <DraftPreviewModal
        submissionId="sub-2"
        onClose={vi.fn()}
        load={() => Promise.resolve(PREVIEW)}
        actions={<ReviewActions submissionId="sub-2" onDecided={onDecided} />}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    expect(approveSubmission).toHaveBeenCalledWith("sub-2");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
