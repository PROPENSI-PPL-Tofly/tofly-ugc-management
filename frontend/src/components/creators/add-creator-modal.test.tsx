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
});
