import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("App not-found screen", () => {
  it("says the page does not exist, in the product's own words", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "Halaman tidak ditemukan" })).toBeInTheDocument();
    expect(screen.getByText("Tofly Creator Management System")).toBeInTheDocument();
    expect(screen.queryByText(/This page could not be found/)).toBeNull();
  });

  it("explains what may have happened to the address", () => {
    render(<NotFound />);

    expect(
      screen.getByText("Alamat ini tidak ada atau sudah dipindahkan. Periksa lagi tautannya."),
    ).toBeInTheDocument();
  });

  it("offers one way on, back to the Creator Database", () => {
    render(<NotFound />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Kembali ke Creator Database" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
  });

  // Whoever lands here may be an admin, a creator or signed out, so no role's menu shows.
  it("shows no menu, as it does not know who is looking", () => {
    render(<NotFound />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
