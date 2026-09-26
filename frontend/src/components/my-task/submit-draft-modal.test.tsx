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
});