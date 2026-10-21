import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  // Measured on the creator's earlier invoice, opened from Riwayat Invoice in its side sheet at
  // 320-390px: the closed bubble, laid out but invisible, ran 30-85px past the sheet, and the
  // sheet scrolled sideways over blank space. Opened, it ran past the edge with its text cut off.
  describe("inside a narrow scrolling sheet", () => {
    function rect(left: number, right: number): DOMRect {
      return { left, right, width: right - left, top: 0, bottom: 20, height: 20, x: left, y: 0, toJSON: () => ({}) };
    }

    function renderInSheet() {
      render(
        <div data-testid="sheet" style={{ overflowY: "auto" }}>
          <InfoTip label="Tentang Estimasi Pendapatan" text="Bisa berubah sampai kamu acknowledge invoice." />
        </div>,
      );
      Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 375 });
      vi.spyOn(screen.getByTestId("sheet"), "getBoundingClientRect").mockReturnValue(rect(0, 375));
      return screen.getByRole("tooltip");
    }

    it("takes no room while closed, so it can never widen the sheet it sits in", () => {
      const tooltip = renderInSheet();

      expect(tooltip).toHaveClass("hidden", "group-hover:block", "group-focus-within:block");
      expect(tooltip).not.toHaveClass("invisible");
    });

    it("is pulled back inside the sheet when it opens near the edge", async () => {
      const tooltip = renderInSheet();
      vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(rect(180, 440));

      fireEvent.focus(screen.getByRole("button", { name: "Tentang Estimasi Pendapatan" }));

      // 440 - (375 - 8): the overhang past the sheet's edge, less an 8px margin.
      await waitFor(() => expect(tooltip.style.left).toBe("-73px"));
    });

    it("is never pulled past the sheet's other edge", async () => {
      const tooltip = renderInSheet();
      vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(rect(40, 420));

      fireEvent.pointerEnter(screen.getByRole("button", { name: "Tentang Estimasi Pendapatan" }));

      // Only 32px of room on the left (40 - 8), though it overhangs by 53px.
      await waitFor(() => expect(tooltip.style.left).toBe("-32px"));
    });

    it("stays where it is when it fits", async () => {
      const tooltip = renderInSheet();
      vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(rect(20, 280));

      fireEvent.focus(screen.getByRole("button", { name: "Tentang Estimasi Pendapatan" }));

      await new Promise((done) => setTimeout(done, 50));
      expect(tooltip.style.left).toBe("");
    });
  });
});
