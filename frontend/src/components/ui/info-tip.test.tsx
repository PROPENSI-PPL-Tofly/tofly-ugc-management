import { render, screen } from "@testing-library/react";
import { InfoTip } from "./info-tip";

describe("InfoTip", () => {
  it("gives the button a name that says what it explains", () => {
    render(<InfoTip label="Info Penalti per Hari" text="Per konten Evergreen yang telat." />);

    expect(screen.getByRole("button", { name: "Info Penalti per Hari" })).toBeInTheDocument();
  });

  it("carries the explanation in a tooltip the button is described by", () => {
    render(<InfoTip label="Info" text="Per konten Evergreen yang telat." />);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Per konten Evergreen yang telat.");
    expect(screen.getByRole("button", { name: "Info" })).toHaveAccessibleDescription(
      "Per konten Evergreen yang telat.",
    );
  });

  it("lines the bubble up with the icon's left edge by default", () => {
    render(<InfoTip label="Info" text="Teks" />);

    expect(screen.getByRole("tooltip")).toHaveClass("left-0");
  });

  it("lines the bubble up with the icon's right edge when asked", () => {
    render(<InfoTip label="Info" text="Teks" align="end" />);

    expect(screen.getByRole("tooltip")).toHaveClass("right-0");
  });
});
