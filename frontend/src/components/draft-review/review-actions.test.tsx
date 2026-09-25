import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { DraftReviewActionError } from "@/lib/draft-review-actions";
import { ReviewActions } from "./review-actions";

const { approveSubmission, reviseSubmission, refresh } = vi.hoisted(() => ({
  approveSubmission: vi.fn(),
  reviseSubmission: vi.fn(),
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
  reviseSubmission: (...args: unknown[]) => reviseSubmission(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

type Props = ComponentProps<typeof ReviewActions>;

function renderActions(props: Partial<Props> = {}) {
  const onDecided = props.onDecided ?? vi.fn();
  render(<ReviewActions submissionId="sub-1" onDecided={onDecided} {...props} />);
  return { onDecided };
}

/** Resolves only when the test says so, to look at the buttons while a decision is pending. */
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ReviewActions", () => {
  beforeEach(() => {
    approveSubmission.mockReset();
    reviseSubmission.mockReset();
    refresh.mockReset();
  });

  it("offers Approve and Minta Revisi for the draft it was opened on", () => {
    renderActions();

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minta Revisi" })).toBeInTheDocument();
  });

  it("approves the draft, refreshes the queue, and reports the decision", async () => {
    approveSubmission.mockResolvedValue(undefined);
    const { onDecided } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    expect(approveSubmission).toHaveBeenCalledWith("sub-1");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while the approval is in flight", async () => {
    const pending = deferred();
    approveSubmission.mockReturnValue(pending.promise);
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    expect(screen.getByRole("button", { name: "Minta Revisi" })).toBeDisabled();
    expect(approve).toHaveAttribute("aria-busy", "true");

    pending.resolve(undefined);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the backend's reason when the approval is rejected, and stays open", async () => {
    approveSubmission.mockRejectedValue(
      new DraftReviewActionError(409, "Draft ini sudah tidak menunggu keputusan"),
    );
    const { onDecided } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Draft ini sudah tidak menunggu keputusan",
    );
    expect(onDecided).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("opens the revision note form from Minta Revisi", () => {
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Minta Revisi" }));

    expect(screen.getByLabelText(/catatan revisi/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("refuses a blank note without calling the backend", () => {
    reviseSubmission.mockResolvedValue(undefined);
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Minta Revisi" }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Catatan revisi tidak boleh kosong.",
    );
    expect(reviseSubmission).not.toHaveBeenCalled();
  });

  it("sends the note, refreshes the queue, and reports the decision", async () => {
    reviseSubmission.mockResolvedValue(undefined);
    const { onDecided } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Minta Revisi" }));
    fireEvent.change(screen.getByLabelText(/catatan revisi/i), {
      target: { value: "Audio terlalu pelan." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    expect(reviseSubmission).toHaveBeenCalledWith("sub-1", "Audio terlalu pelan.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the failure and keeps the note when the revision is rejected", async () => {
    reviseSubmission.mockRejectedValue(
      new DraftReviewActionError(409, "Creator sudah mengirim draft yang lebih baru"),
    );
    const { onDecided } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Minta Revisi" }));
    fireEvent.change(screen.getByLabelText(/catatan revisi/i), {
      target: { value: "Audio terlalu pelan." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Revisi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Creator sudah mengirim draft yang lebih baru",
    );
    expect(onDecided).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/catatan revisi/i)).toHaveValue("Audio terlalu pelan.");
    expect(screen.getByRole("button", { name: "Kirim Revisi" })).toBeEnabled();
  });

  it("collapses the form and clears the error from Batal", async () => {
    approveSubmission.mockRejectedValue(new DraftReviewActionError(500, "Server error"));
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Minta Revisi" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/catatan revisi/i), {
      target: { value: "draf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByLabelText(/catatan revisi/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Minta Revisi" }));
    expect(screen.getByLabelText(/catatan revisi/i)).toHaveValue("");
  });
});
