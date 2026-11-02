import { render, screen } from "@testing-library/react";
import CreatorDashboardLoading from "./loading";

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/dashboard",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

describe("Creator dashboard while loading", () => {
  it("keeps the creator frame and says the summary is on its way, not zeros", () => {
    render(<CreatorDashboardLoading />);

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Memuat ringkasan task…");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
