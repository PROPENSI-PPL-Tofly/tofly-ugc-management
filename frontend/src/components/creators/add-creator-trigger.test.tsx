import { fireEvent, render, screen } from "@testing-library/react";
import { AddCreatorTrigger } from "./add-creator-trigger";

describe("AddCreatorTrigger", () => {
  // Manual QA report: "Save is enabled on a valid form, but clicking it does nothing." Audit
  // trace confirmed AddCreatorModal correctly calls onSubmit(form) on a valid click (see
  // add-creator-modal.test.tsx's "calls onSubmit..." test, still passing) — the break is here:
  // this component wired onSubmit to a hardcoded no-op, so the call lands but has no effect.
  // Closing the modal is the minimal, backend-free signal that the submit actually did
  // something, without touching POST /creators (out of Subtask 1's scope).
  it("closes the modal after a valid Save click", () => {
    render(<AddCreatorTrigger />);

    fireEvent.click(screen.getByRole("button", { name: /tambah creator/i }));

    fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "bagas@example.com" } });
    fireEvent.change(screen.getByLabelText(/^platform$/i), { target: { value: "instagram" } });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "salsa.amelia" } });
    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2099-01-01" } });
    fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "6" } });

    expect(screen.getByRole("button", { name: /simpan/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
