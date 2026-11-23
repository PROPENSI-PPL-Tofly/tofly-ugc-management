import { render, screen } from "@testing-library/react";
import { currentRole } from "@/lib/session.server";
import NotFound from "./not-found";

vi.mock("@/lib/session.server", () => ({ currentRole: vi.fn() }));

async function renderNotFound() {
  render(await NotFound());
}

describe("App not-found screen", () => {
  beforeEach(() => {
    vi.mocked(currentRole).mockResolvedValue("admin");
  });

  it("says the page does not exist, in the product's own words", async () => {
    await renderNotFound();

    expect(screen.getByRole("heading", { level: 1, name: "Halaman tidak ditemukan" })).toBeInTheDocument();
    expect(screen.getByText("Tofly Creator Management System")).toBeInTheDocument();
    expect(screen.queryByText(/This page could not be found/)).toBeNull();
  });

  it("explains what may have happened to the address", async () => {
    await renderNotFound();

    expect(
      screen.getByText("Alamat ini tidak ada atau sudah dipindahkan. Periksa lagi tautannya."),
    ).toBeInTheDocument();
  });

  it("offers an admin one way on, back to the Kreator", async () => {
    await renderNotFound();

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Kembali ke Kreator" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
  });

  // A creator who lands here has no business in the admin's Kreator list.
  it("offers a creator the way back to their own Dashboard", async () => {
    vi.mocked(currentRole).mockResolvedValue("creator");

    await renderNotFound();

    expect(screen.getByRole("link", { name: "Kembali ke Dashboard" })).toHaveAttribute(
      "href",
      "/creator/dashboard",
    );
  });

  it("offers a signed-out visitor the sign-in", async () => {
    vi.mocked(currentRole).mockResolvedValue(null);
    await renderNotFound();
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
  });

  it("still answers when the session cannot be read", async () => {
    vi.mocked(currentRole).mockRejectedValue(new Error("backend down"));
    await renderNotFound();
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
  });

  // Whoever lands here may be an admin, a creator or signed out, so no role's menu shows.
  it("shows no menu, whoever is looking", async () => {
    await renderNotFound();

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
