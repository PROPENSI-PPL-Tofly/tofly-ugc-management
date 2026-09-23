import { render, screen } from "@testing-library/react";
import { AddCreatorModal } from "./add-creator-modal";

describe("AddCreatorModal", () => {
  it("renders all the required fields", () => {
    render(<AddCreatorModal onClose={() => {}} />);

    expect(screen.getByLabelText(/nama creator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mulai kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/akhir kontrak/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jarak antar-deadline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fixed rate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/jumlah konten/i)).toBeInTheDocument();
  });
});
