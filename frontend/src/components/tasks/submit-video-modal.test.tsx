import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubmitError } from "@/lib/tasks";
import { SubmitVideoModal } from "./submit-video-modal";
import { myTask } from "./task.fixture";

const submitVideo = vi.fn();

vi.mock("@/lib/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks")>("@/lib/tasks");
  return { ...actual, submitVideo: (...args: unknown[]) => submitVideo(...args) };
});

const approved = myTask({
  status: "draft_approved",
  actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: true, inGracePeriod: false },
});

function renderModal(task = approved) {
  const onClose = vi.fn();
  const onSubmitted = vi.fn();
  render(<SubmitVideoModal task={task} onClose={onClose} onSubmitted={onSubmitted} />);
  return { onClose, onSubmitted };
}

const linkField = () => screen.getByLabelText(/Link video yang sudah diupload/);
const submitButton = () => screen.getByRole("button", { name: "Submit" });

describe("SubmitVideoModal", () => {
  beforeEach(() => {
    submitVideo.mockReset();
  });

  it("opens with the content's details", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "Submit Link Video" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Info konten" })).toHaveTextContent("Draft Approved");
    expect(submitButton()).toBeDisabled();
  });

  it.each([
    "https://youtube.com/shorts/abc",
    "https://instagram.com.evil.example/reel/1",
    "instagram.com/reel/1",
  ])("keeps Submit disabled and explains why for %s", async (link) => {
    renderModal();

    await userEvent.type(linkField(), link);

    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(/Link harus berupa URL Instagram \(instagram.com\) atau TikTok \(tiktok.com\)/)).toBeInTheDocument();
  });

  it.each([
    ["https://www.instagram.com/reel/C8abc/", "Instagram"],
    ["https://vm.tiktok.com/ZSabc123/", "TikTok"],
  ])("enables Submit for %s and names the platform", async (link, label) => {
    renderModal();

    await userEvent.type(linkField(), link);

    expect(submitButton()).toBeEnabled();
    expect(screen.getByText(`Platform terdeteksi: ${label}`)).toBeInTheDocument();
  });

  it("sends the link and hands back the updated task", async () => {
    const updated = myTask({ status: "link_submitted", platform: "tiktok" });
    submitVideo.mockResolvedValue(updated);
    const { onSubmitted } = renderModal();

    await userEvent.type(linkField(), "https://www.tiktok.com/@tofly/video/1");
    await userEvent.click(submitButton());

    expect(submitVideo).toHaveBeenCalledWith("content-1", "https://www.tiktok.com/@tofly/video/1");
    expect(onSubmitted).toHaveBeenCalledWith(updated);
  });

  it("shows the backend's refusal and allows another try", async () => {
    submitVideo.mockRejectedValueOnce(new SubmitError("Link video untuk konten ini sudah dikirim", 409));
    const { onSubmitted } = renderModal();

    await userEvent.type(linkField(), "https://www.instagram.com/reel/C8abc/");
    await userEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("sudah dikirim");
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("reports a failure that is not an Error too", async () => {
    submitVideo.mockRejectedValueOnce("jaringan putus");
    renderModal();

    await userEvent.type(linkField(), "https://www.instagram.com/reel/C8abc/");
    await userEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("jaringan putus");
  });

  it("does not send twice while a submit is in flight, nor an invalid link from the keyboard", async () => {
    submitVideo.mockReturnValue(new Promise(() => {}));
    renderModal();

    await userEvent.type(linkField(), "https://youtube.com/x{enter}");
    expect(submitVideo).not.toHaveBeenCalled();

    await userEvent.clear(linkField());
    await userEvent.type(linkField(), "https://www.instagram.com/reel/C8abc/");
    await userEvent.click(submitButton());
    expect(screen.getByRole("button", { name: "Mengirim…" })).toBeDisabled();
    await userEvent.type(linkField(), "{enter}");
    expect(submitVideo).toHaveBeenCalledTimes(1);
  });

  it("explains the H-1 grace window when the draft was never approved", () => {
    renderModal(
      myTask({
        status: "draft_review",
        daysUntilDeadline: 1,
        actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: true, inGracePeriod: true },
      }),
    );

    expect(screen.getByText(/masa tenggang H-1/)).toBeInTheDocument();
  });

  it("does not mention the grace window for an approved draft", () => {
    renderModal(
      myTask({
        status: "draft_approved",
        daysUntilDeadline: 1,
        actions: { canSubmitDraft: false, isResubmission: false, canSubmitVideo: true, inGracePeriod: true },
      }),
    );

    expect(screen.queryByText(/masa tenggang H-1/)).not.toBeInTheDocument();
  });

  it("closes on Batal", async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onClose).toHaveBeenCalled();
  });
});
