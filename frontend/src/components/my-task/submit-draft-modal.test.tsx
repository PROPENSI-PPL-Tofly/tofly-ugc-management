import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubmitDraftModal } from "./submit-draft-modal";

describe("SubmitDraftModal", () => {
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
});