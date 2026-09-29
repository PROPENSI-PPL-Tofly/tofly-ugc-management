import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("states what is missing and what to do about it", () => {
    render(
      <EmptyState
        title="Belum ada creator."
        hint="Tambahkan creator pertama."
        action={<a href="/x">Tambah</a>}
      />,
    );
    expect(screen.getByText("Belum ada creator.")).toBeInTheDocument();
    expect(screen.getByText("Tambahkan creator pertama.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tambah" })).toBeInTheDocument();
  });

  it("renders with the title alone", () => {
    const { container } = render(<EmptyState title="Kosong." />);
    expect(container).toHaveTextContent("Kosong.");
  });
});
