import { render, screen } from "@testing-library/react";
import RateInvoicingPage, { metadata } from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/invoicing",
}));

vi.mock("@/lib/rate-formula-api", () => ({
  fetchRateFormula: vi.fn(),
  saveRateFormula: vi.fn(),
}));

describe("Rate & Invoicing page", () => {
  it("titles the page and says what it shows", () => {
    render(<RateInvoicingPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Rate & Invoicing" })).toBeInTheDocument();
    expect(screen.getByText("Total invoice per creator dan statusnya")).toBeInTheDocument();
    expect(metadata.title).toBe("Rate & Invoicing — Tofly");
  });

  it("heads the panel with the formula behind an ⓘ", () => {
    render(<RateInvoicingPage />);

    expect(screen.getByRole("heading", { level: 2, name: /rate & invoicing/i })).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Final Rate = Fixed Rate + Konten Tambahan + Bonus − Penalti",
    );
  });

  it("has the Atur Formula Rate button in the panel head", () => {
    render(<RateInvoicingPage />);

    expect(screen.getByRole("button", { name: /atur formula rate/i })).toBeInTheDocument();
  });

  it("lists Rate & Invoicing in the menu, as the current page", () => {
    render(<RateInvoicingPage />);

    expect(screen.getByRole("link", { name: "Rate & Invoicing" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
