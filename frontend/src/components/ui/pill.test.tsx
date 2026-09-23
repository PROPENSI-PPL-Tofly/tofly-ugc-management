import { render, screen } from "@testing-library/react";
import { Pill, StatusDot } from "./pill";

describe("Pill", () => {
  it("renders its label", () => {
    render(<Pill tone="green">Baik</Pill>);
    expect(screen.getByText("Baik")).toBeInTheDocument();
  });

  it("falls back to the neutral tone", () => {
    render(<Pill>Tanpa data</Pill>);
    expect(screen.getByText("Tanpa data").className).toContain("surface-2");
  });
});

describe("StatusDot", () => {
  it("keeps the dot out of the accessible name", () => {
    render(<StatusDot tone="red">Kontrak berakhir</StatusDot>);
    expect(screen.getByText("Kontrak berakhir")).toHaveTextContent(/^Kontrak berakhir$/);
  });

  it("falls back to the neutral tone", () => {
    const { container } = render(<StatusDot>Belum ada kontrak</StatusDot>);
    expect(container.querySelector('[aria-hidden="true"]')?.className).toContain("rule");
  });
});
