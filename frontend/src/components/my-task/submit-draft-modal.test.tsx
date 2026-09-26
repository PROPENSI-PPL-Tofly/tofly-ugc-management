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
import type { DraftSubmitter } from "@/lib/draft-submission";
import {
  SubmitDraftModal,
  type SubmitDraftModalProps,
} from "./submit-draft-modal";

// This mock follows the same contract as the real draft submission service.
const mockSubmitDraft = vi.fn<DraftSubmitter>();

const defaultContent = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Morning Routine",
  deadline: "2026-10-05",
};

// Keeps repeated setup in one place while still allowing individual tests
// to replace a prop when they need a different scenario.
function renderModal(
  overrides: Partial<SubmitDraftModalProps> = {},
) {
  render(
    <SubmitDraftModal
      content={defaultContent}
      onClose={vi.fn()}
      onSubmitted={vi.fn()}
      submitDraftAction={mockSubmitDraft}
      {...overrides}
    />,
  );
}

describe("SubmitDraftModal", () => {
  beforeEach(() => {
    // Prevent mock calls and results from leaking between tests.
    mockSubmitDraft.mockReset();
  });

  it("shows the selected content as read-only information", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", {
        name: "Submit Draft",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Morning Routine"),
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

  it("shows a required draft link and optional admin notes", () => {
    renderModal();

    expect(
      screen.getByLabelText(/link file draft/i),
    ).toBeRequired();

    expect(
      screen.getByLabelText(/catatan untuk admin/i),
    ).not.toBeRequired();
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
  ])("rejects a %s draft link", (_case, link) => {
    renderModal();

    // Try a representative value from the invalid blank-input group.
    fireEvent.change(
      screen.getByLabelText(/link file draft/i),
      {
        target: { value: link },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Draft",
      }),
    );

    expect(
      screen.getByText("Link file draft wajib diisi"),
    ).toBeInTheDocument();
  });

  it("submits trimmed draft data for the selected content", async () => {
    mockSubmitDraft.mockResolvedValue({
      ok: true,
      submission: {
        contentId: defaultContent.id,
        submissionId: "submission-1",
        status: "draft_review",
        link: "https://drive.google.com/file/d/example",
        notes: "Please check the intro",
        submittedAt: "2026-09-26T10:00:00.000Z",
      },
    });

    renderModal();

    // Add surrounding spaces to verify that values are normalized.
    fireEvent.change(
      screen.getByLabelText(/link file draft/i),
      {
        target: {
          value:
            "  https://drive.google.com/file/d/example  ",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/catatan untuk admin/i),
      {
        target: {
          value: "  Please check the intro  ",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Draft",
      }),
    );

    await waitFor(() => {
      expect(mockSubmitDraft).toHaveBeenCalledWith(
        defaultContent.id,
        {
          link: "https://drive.google.com/file/d/example",
          notes: "Please check the intro",
        },
      );
    });
  });

  it("prevents duplicate submission while the request is pending", async () => {
    // Keep the fake request pending until this test resolves it manually.
    let resolveSubmission:
      | ((
          value: Awaited<
            ReturnType<DraftSubmitter>
          >,
        ) => void)
      | undefined;

    mockSubmitDraft.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmission = resolve;
      }),
    );

    renderModal();

    fireEvent.change(
      screen.getByLabelText(/link file draft/i),
      {
        target: {
          value:
            "https://drive.google.com/file/d/example",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Kirim Draft",
      }),
    );

    // The action becomes unavailable while the request is running.
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Mengirim...",
        }),
      ).toBeDisabled();
    });

    // Attempting another click must not create a second request.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Mengirim...",
      }),
    );

    expect(mockSubmitDraft).toHaveBeenCalledTimes(1);

    // Finish the fake request so the component returns to its idle state.
    resolveSubmission?.({
      ok: true,
      submission: {
        contentId: defaultContent.id,
        submissionId: "submission-1",
        status: "draft_review",
        link: "https://drive.google.com/file/d/example",
        notes: null,
        submittedAt: "2026-09-26T10:00:00.000Z",
      },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Kirim Draft",
        }),
      ).toBeEnabled();
    });
  });
  it("notifies the parent and closes after a successful submission", async () => {
  const onSubmitted = vi.fn();
  const onClose = vi.fn();

  mockSubmitDraft.mockResolvedValue({
    ok: true,
    submission: {
      contentId: defaultContent.id,
      submissionId: "submission-1",
      status: "draft_review",
      link: "https://drive.google.com/file/d/example",
      notes: null,
      submittedAt: "2026-09-26T10:00:00.000Z",
    },
  });

  renderModal({
    onSubmitted,
    onClose,
  });

  fireEvent.change(
    screen.getByLabelText(/link file draft/i),
    {
      target: {
        value:
          "https://drive.google.com/file/d/example",
      },
    },
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Kirim Draft",
    }),
  );

  await waitFor(() => {
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
it("shows a field error and keeps the modal open when submission validation fails", async () => {
  const onSubmitted = vi.fn();
  const onClose = vi.fn();

  mockSubmitDraft.mockResolvedValue({
    ok: false,
    message: "Data draft tidak valid",
    errors: {
      link: "Link draft harus berupa URL http atau https",
    },
  });

  renderModal({
    onSubmitted,
    onClose,
  });

  fireEvent.change(
    screen.getByLabelText(/link file draft/i),
    {
      target: {
        value: "not-a-valid-web-link",
      },
    },
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Kirim Draft",
    }),
  );

  expect(
    await screen.findByText(
      "Link draft harus berupa URL http atau https",
    ),
  ).toBeInTheDocument();

  // A failed submission must not notify the parent or close the modal.
  expect(onSubmitted).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it("shows an eligibility error and keeps the modal open", async () => {
  const onSubmitted = vi.fn();
  const onClose = vi.fn();

  mockSubmitDraft.mockResolvedValue({
    ok: false,
    code: "DRAFT_NOT_ELIGIBLE",
    message: "Konten ini sedang tidak menerima draft",
  });

  renderModal({
    onSubmitted,
    onClose,
  });

  fireEvent.change(
    screen.getByLabelText(/link file draft/i),
    {
      target: {
        value: "https://drive.google.com/file/d/example",
      },
    },
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Kirim Draft",
    }),
  );

  expect(
    await screen.findByRole("alert"),
  ).toHaveTextContent(
    "Konten ini sedang tidak menerima draft",
  );

  // Keep the form open so the creator can understand what happened.
  expect(onSubmitted).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
it("shows a notes validation error without closing the modal", async () => {
  const onClose = vi.fn();

  mockSubmitDraft.mockResolvedValue({
    ok: false,
    message: "Data draft tidak valid",
    errors: {
      notes: "Catatan maksimal 1000 karakter",
    },
  });

  renderModal({ onClose });

  fireEvent.change(screen.getByLabelText("Link File Draft"), {
    target: {
      value: "https://drive.google.com/file/d/test",
    },
  });

  fireEvent.click(
    screen.getByRole("button", {
      name: "Kirim Draft",
    }),
  );

  expect(
    await screen.findByText("Catatan maksimal 1000 karakter"),
  ).toBeInTheDocument();

  expect(onClose).not.toHaveBeenCalled();
});
it("limits admin notes to 1000 characters", () => {
  renderModal();

  expect(
    screen.getByLabelText("Catatan untuk Admin"),
  ).toHaveAttribute("maxLength", "1000");
});
});