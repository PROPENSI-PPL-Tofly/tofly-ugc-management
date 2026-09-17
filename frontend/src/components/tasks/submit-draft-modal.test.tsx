import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubmitError } from "@/lib/tasks";
import { SubmitDraftModal } from "./submit-draft-modal";
import { myTask } from "./task.fixture";

const submitDraft = vi.fn();

vi.mock("@/lib/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks")>("@/lib/tasks");
  return { ...actual, submitDraft: (...args: unknown[]) => submitDraft(...args) };
});

function renderModal(task = myTask()) {
  const onClose = vi.fn();
  const onSubmitted = vi.fn();
  render(<SubmitDraftModal task={task} onClose={onClose} onSubmitted={onSubmitted} />);
  return { onClose, onSubmitted };
}

const submitButton = () => screen.getByRole("button", { name: "Submit" });

describe("SubmitDraftModal", () => {
  beforeEach(() => {
    submitDraft.mockReset();
  });

  it("opens with the content's details, read-only", () => {
    renderModal(myTask({ type: "specific", brief: "Tunjukkan fitur Tobi AI" }));

    expect(screen.getByRole("dialog", { name: "Submit Draft" })).toBeInTheDocument();
    const info = screen.getByRole("region", { name: "Info konten" });
    expect(info).toHaveTextContent("Evergreen - Review Fitur Tobi AI");
    expect(info).toHaveTextContent("Specific");
    expect(info).toHaveTextContent("1 Okt 2026");
    expect(info).toHaveTextContent("Scheduled");
    expect(info).toHaveTextContent("Tunjukkan fitur Tobi AI");
  });

  it("keeps Submit disabled until the required link is a real URL", async () => {
    renderModal();

    expect(submitButton()).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Link file draft/), "drive.google.com/abc");
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(/diawali http:\/\/ atau https:\/\//)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Link file draft/));
    await userEvent.type(screen.getByLabelText(/Link file draft/), "https://drive.google.com/abc");
    expect(submitButton()).toBeEnabled();
    expect(screen.queryByText(/diawali http:\/\//)).not.toBeInTheDocument();
  });

  it("sends the link and the optional note, then hands back the updated task", async () => {
    const updated = myTask({ status: "draft_review" });
    submitDraft.mockResolvedValue(updated);
    const { onSubmitted } = renderModal();

    await userEvent.type(screen.getByLabelText(/Link file draft/), "https://drive.google.com/abc");
    await userEvent.type(screen.getByLabelText(/Catatan untuk Admin/), "Versi pertama");
    await userEvent.click(submitButton());

    expect(submitDraft).toHaveBeenCalledWith("content-1", {
      link: "https://drive.google.com/abc",
      creatorNotes: "Versi pertama",
    });
    expect(onSubmitted).toHaveBeenCalledWith(updated);
  });

  it("shows the backend's refusal and lets the creator try again", async () => {
    submitDraft.mockRejectedValueOnce(
      new SubmitError("Draft hanya bisa dikirim saat konten berstatus Scheduled atau perlu revisi", 409),
    );
    const { onSubmitted } = renderModal();

    await userEvent.type(screen.getByLabelText(/Link file draft/), "https://drive.google.com/abc");
    await userEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("berstatus Scheduled atau perlu revisi");
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("reports a failure that is not an Error too", async () => {
    submitDraft.mockRejectedValueOnce("jaringan putus");
    renderModal();

    await userEvent.type(screen.getByLabelText(/Link file draft/), "https://drive.google.com/abc");
    await userEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("jaringan putus");
  });

  it("does not send twice while a submit is in flight", async () => {
    submitDraft.mockReturnValue(new Promise(() => {}));
    renderModal();

    await userEvent.type(screen.getByLabelText(/Link file draft/), "https://drive.google.com/abc");
    await userEvent.click(submitButton());

    expect(screen.getByRole("button", { name: "Mengirim…" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Link file draft/), "{enter}");
    expect(submitDraft).toHaveBeenCalledTimes(1);
  });

  it("does not submit an invalid link from the keyboard", async () => {
    renderModal();

    await userEvent.type(screen.getByLabelText(/Link file draft/), "bukan link{enter}");

    expect(submitDraft).not.toHaveBeenCalled();
  });

  it("becomes Resubmit Draft and shows the admin's revision note", () => {
    renderModal(
      myTask({
        status: "draft_revision",
        latestDraft: {
          link: "https://drive.google.com/v1",
          creatorNotes: null,
          submittedAt: "2026-09-10",
          revisionNotes: "Hook 3 detik pertama kurang kuat",
          revisionCount: 0,
        },
        actions: { canSubmitDraft: true, isResubmission: true, canSubmitVideo: false, inGracePeriod: false },
      }),
    );

    expect(screen.getByRole("dialog", { name: "Resubmit Draft" })).toBeInTheDocument();
    expect(screen.getByText("Hook 3 detik pertama kurang kuat")).toBeInTheDocument();
  });

  it("closes on Batal", async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onClose).toHaveBeenCalled();
  });
});
