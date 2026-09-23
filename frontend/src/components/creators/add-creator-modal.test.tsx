import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AddCreatorModal } from "./add-creator-modal";

describe("AddCreatorModal", () => {
  it("renders all the required fields", () => {
    render(<AddCreatorModal onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByLabelText(/nama creator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mulai kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/akhir kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jarak antar-deadline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fixed rate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jumlah konten/i)).toBeInTheDocument();
  });

  it("shows an error and does not submit when required fields are empty", () => {
    const onSubmit = vi.fn();

    render(<AddCreatorModal onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    expect(screen.getByText("Nama wajib diisi")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Dates pinned far in the future (not just "next month") so this test does not go flaky
  // as the real clock advances — the component calls validateCreatorForm with the real
  // clock, it has no injectable `today` the way the pure function does.
  it("calls onSubmit with the form data when everything is valid", () => {
    const onSubmit = vi.fn();

    render(<AddCreatorModal onClose={() => {}} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/nama creator/i), { target: { value: "Bagas" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "bagas@example.com" } });
    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2099-01-01" } });
    fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText(/jarak antar-deadline/i), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText(/fixed rate/i), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "6" } });

    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Bagas",
      email: "bagas@example.com",
      contractStart: "2099-01-01",
      contractEnd: "2099-12-31",
      interval: 14,
      quota: 6,
      fixedRate: 500000,
    });
  });
});
