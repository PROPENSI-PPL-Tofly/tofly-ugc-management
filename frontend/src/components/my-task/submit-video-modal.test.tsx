import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { VideoSubmitter } from "@/lib/video-submission";
import {
  SubmitVideoModal,
  type SubmitVideoModalProps,
} from "./submit-video-modal";

// This mock follows the same contract as the real video submission service.
const mockSubmitVideo = vi.fn<VideoSubmitter>();

const defaultContent = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Promo Lebaran",
  deadline: "2026-10-05",
};

const VIDEO_LINK = "https://www.tiktok.com/@tofly/video/7400000000000000000";

const INSTAGRAM_LINK = "https://www.instagram.com/reel/C8abc12345/";

const UNSUPPORTED_LINK = "https://youtube.com/watch?v=dQw4w9WgXcQ";

const PLATFORM_ERROR = "Link harus berupa URL Instagram atau TikTok";

function renderModal(
  overrides: Partial<SubmitVideoModalProps> = {},
) {
  render(
    <SubmitVideoModal
      content={defaultContent}
      onClose={vi.fn()}
      onSubmitted={vi.fn()}
      submitVideoAction={mockSubmitVideo}
      {...overrides}
    />,
  );
}

describe("SubmitVideoModal", () => {
  beforeEach(() => {
    mockSubmitVideo.mockReset();
  });

  it("shows the selected content as read-only information", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", {
        name: "Submit Link Video",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Promo Lebaran"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/2026-10-05/),
    ).toBeInTheDocument();

    // Content information is displayed as text rather than an editable field.
    expect(
      screen.queryByRole("textbox", {
        name: /nama konten/i,
      }),
    ).toBeNull();
  });

  it("shows a required video link", () => {
    renderModal();

    expect(
      screen.getByLabelText("Link Video"),
    ).toBeRequired();
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
  ])("rejects a %s video link", (_case, link) => {
    renderModal();

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      {
        target: { value: link },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Link",
      }),
    );

    expect(
      screen.getByText("Link video wajib diisi"),
    ).toBeInTheDocument();

    expect(mockSubmitVideo).not.toHaveBeenCalled();
  });

  it("keeps the submit button usable while the link is still empty", () => {
    renderModal();

    expect(
      screen.getByRole("button", { name: "Kirim Link" }),
    ).toBeEnabled();
  });

  it("rejects a non-Instagram/TikTok link as soon as it is typed", () => {
    renderModal();

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: UNSUPPORTED_LINK } },
    );

    expect(
      screen.getByText(PLATFORM_ERROR),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Kirim Link" }),
    ).toBeDisabled();

    expect(mockSubmitVideo).not.toHaveBeenCalled();
  });

  it("recovers the submit button when the link becomes supported", () => {
    renderModal();

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: UNSUPPORTED_LINK } },
    );

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: INSTAGRAM_LINK } },
    );

    expect(
      screen.queryByText(PLATFORM_ERROR),
    ).toBeNull();

    expect(
      screen.getByRole("button", { name: "Kirim Link" }),
    ).toBeEnabled();
  });

  it("enables submission for an Instagram or TikTok link without any error", () => {
    renderModal();

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: VIDEO_LINK } },
    );

    expect(
      screen.queryByText(PLATFORM_ERROR),
    ).toBeNull();

    expect(
      screen.getByRole("button", { name: "Kirim Link" }),
    ).toBeEnabled();
  });

  it("submits the trimmed video link for the selected content", async () => {
    mockSubmitVideo.mockResolvedValue({
      ok: true,
      submission: {
        contentId: defaultContent.id,
        status: "link_submitted",
        videoLink: VIDEO_LINK,
        platform: "tiktok",
        submittedAt: "2026-09-26T10:00:00.000Z",
      },
    });

    renderModal();

    // Add surrounding spaces to verify that the value is normalized.
    fireEvent.change(
      screen.getByLabelText("Link Video"),
      {
        target: { value: `  ${VIDEO_LINK}  ` },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Link",
      }),
    );

    await waitFor(() => {
      expect(mockSubmitVideo).toHaveBeenCalledWith(
        defaultContent.id,
        { link: VIDEO_LINK },
      );
    });
  });

  it("notifies the parent and closes after a successful submission", async () => {
    const onSubmitted = vi.fn();
    const onClose = vi.fn();

    mockSubmitVideo.mockResolvedValue({
      ok: true,
      submission: {
        contentId: defaultContent.id,
        status: "link_submitted",
        videoLink: VIDEO_LINK,
        platform: "tiktok",
        submittedAt: "2026-09-26T10:00:00.000Z",
      },
    });

    renderModal({ onSubmitted, onClose });

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: VIDEO_LINK } },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Link",
      }),
    );

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("prevents duplicate submission while the request is pending", async () => {
    let resolveSubmission:
      | ((value: Awaited<ReturnType<VideoSubmitter>>) => void)
      | undefined;

    mockSubmitVideo.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmission = resolve;
      }),
    );

    renderModal();

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: VIDEO_LINK } },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Link",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Mengirim...",
        }),
      ).toBeDisabled();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mengirim...",
      }),
    );

    expect(mockSubmitVideo).toHaveBeenCalledTimes(1);

    resolveSubmission?.({
      ok: true,
      submission: {
        contentId: defaultContent.id,
        status: "link_submitted",
        videoLink: VIDEO_LINK,
        platform: "tiktok",
        submittedAt: "2026-09-26T10:00:00.000Z",
      },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Kirim Link",
        }),
      ).toBeEnabled();
    });
  });

  it("shows the backend's videoLink field error and keeps the modal open", async () => {
    const onSubmitted = vi.fn();
    const onClose = vi.fn();

    mockSubmitVideo.mockResolvedValue({
      ok: false,
      message: "Data link video tidak valid",
      errors: {
        videoLink: "Link video maksimal 2048 karakter",
      },
    });

    renderModal({ onSubmitted, onClose });

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: INSTAGRAM_LINK } },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Link",
      }),
    );

    expect(
      await screen.findByText(
        "Link video maksimal 2048 karakter",
      ),
    ).toBeInTheDocument();

    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an eligibility error and keeps the modal open", async () => {
    const onSubmitted = vi.fn();
    const onClose = vi.fn();

    mockSubmitVideo.mockResolvedValue({
      ok: false,
      code: "VIDEO_NOT_ELIGIBLE",
      message: "Konten ini sedang tidak menerima link video",
    });

    renderModal({ onSubmitted, onClose });

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: VIDEO_LINK } },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Link",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Konten ini sedang tidak menerima link video",
    );

    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the link when a submission fails so the creator can retry", async () => {
    mockSubmitVideo.mockResolvedValue({
      ok: false,
      message: "Server sedang sibuk. Coba lagi.",
    });

    renderModal();

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: VIDEO_LINK } },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Link",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Server sedang sibuk. Coba lagi.");

    expect(
      screen.getByLabelText("Link Video"),
    ).toHaveValue(VIDEO_LINK);
  });

  it("closes without submitting when Batal is pressed", () => {
    const onClose = vi.fn();
    const onSubmitted = vi.fn();

    renderModal({ onClose, onSubmitted });

    fireEvent.change(
      screen.getByLabelText("Link Video"),
      { target: { value: VIDEO_LINK } },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Batal" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(mockSubmitVideo).not.toHaveBeenCalled();
  });
});

