import { render, screen, within } from "@testing-library/react";
import CreatorNotFound from "./not-found";

const TYPED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => `/admin/creators/${TYPED}`,
  useSearchParams: () => new URLSearchParams(),
}));

describe("Creator Detail not-found screen", () => {
  it("says there is no such creator, inside the admin frame with its menu", () => {
    render(<CreatorNotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "Detail Creator" })).toBeInTheDocument();
    expect(screen.getByText("Creator tidak ditemukan")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu admin" })).toBeInTheDocument();
  });

  it("explains why, without repeating whatever was typed into the address", () => {
    render(<CreatorNotFound />);

    expect(
      screen.getByText("Creator ini tidak ada atau sudah dihapus. Periksa lagi tautannya."),
    ).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TYPED))).toBeNull();
  });

  it("offers the way back to the Creator Database, in the page itself", () => {
    render(<CreatorNotFound />);

    expect(
      within(screen.getByRole("main")).getByRole("link", { name: "Kembali ke Creator Database" }),
    ).toHaveAttribute("href", "/admin/creators");
  });
});
