import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SubmitDraftModal } from "./submit-draft-modal";
import { submitDraft } from "@/lib/draft-submission";

vi.mock("@/lib/draft-submission", () => ({
  submitDraft: vi.fn(),
}));

const mockedSubmitDraft = vi.mocked(submitDraft);

describe("SubmitDraftModal", () => {
    beforeEach(() => {
  // Prevent one test's mock calls or results from leaking into another test.
  mockedSubmitDraft.mockReset();
});
  it("shows the selected content as read-only information", () => {
    render(
      <SubmitDraftModal
        content={{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Morning Routine",
          deadline: "2026-10-05",
        }}
        onClose={vi.fn()}
      />,
    );

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

    expect(
      screen.queryByRole("textbox", {
        name: /nama konten/i,
      }),
    ).toBeNull();
  });
  it("shows a required draft link and optional admin notes", () => {
  render(
    <SubmitDraftModal
      content={{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Morning Routine",
        deadline: "2026-10-05",
      }}
      onClose={vi.fn()}
    />,
  );

  // The draft link must be filled before submission.
  expect(
    screen.getByLabelText(/link file draft/i),
  ).toBeRequired();

  // Notes are available but may be left empty.
  expect(
    screen.getByLabelText(/catatan untuk admin/i),
  ).not.toBeRequired();
});
it.each([
  ["empty", ""],
  ["whitespace only", "   "],
])("rejects a %s draft link", (_case, link) => {
  render( 
    <SubmitDraftModal
      content={{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Morning Routine",
        deadline: "2026-10-05",
      }}
      onClose={vi.fn()}
    />,
  );

  // Try an invalid value from the blank-input partition.
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

  // The creator should receive a clear validation message.
  expect(
    screen.getByText("Link file draft wajib diisi"),
  ).toBeInTheDocument();
});
it("submits trimmed draft data for the selected content", async () => {
  mockedSubmitDraft.mockResolvedValue({
    ok: true,
    submission: {
      contentId: "11111111-1111-4111-8111-111111111111",
      submissionId: "submission-1",
      status: "draft_review",
      link: "https://drive.google.com/file/d/example",
      notes: "Please check the intro",
      submittedAt: "2026-09-26T10:00:00.000Z",
    },
  });

  render(
    <SubmitDraftModal
      content={{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Morning Routine",
        deadline: "2026-10-05",
      }}
      onClose={vi.fn()}
    />,
  );

  // Include surrounding spaces to verify that form values are normalized.
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
    expect(mockedSubmitDraft).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        link: "https://drive.google.com/file/d/example",
        notes: "Please check the intro",
      },
    );
  });
});
});