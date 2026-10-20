import { render, screen } from "@testing-library/react";
import { ProofLink } from "./proof-link";

const HREF = "/api/invoices/0b9c1f2e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/payment-proof";

describe("ProofLink", () => {
  it("opens the proof by its file name in a new tab that cannot reach back into the panel", () => {
    render(<ProofLink proof={{ fileName: "bukti.pdf", href: HREF, uploadedAt: "2026-10-20T08:00:00.000Z" }} />);

    const link = screen.getByRole("link", { name: "bukti.pdf" });
    expect(link).toHaveAttribute("href", HREF);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("names the file alone, with no link, when its link is not offered", () => {
    render(<ProofLink proof={{ fileName: "bukti.pdf", href: null, uploadedAt: "2026-10-20T08:00:00.000Z" }} />);

    expect(screen.getByText("bukti.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
