import { act, fireEvent, render, screen } from "@testing-library/react";
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

  // Once nothing around it clips, the bubble can still run off the window: on a phone the
  // Produktivitas card sits in the right column and its 260 px bubble opened 182 px past the edge.
  // jsdom lays nothing out, so the boxes a browser would measure are stubbed in.
  describe("near the edge of the window", () => {
    function box(left: number, top: number, width: number, height: number): DOMRect {
      return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
    }

    /** Sizes the window and puts the icon and its bubble where a browser would. */
    function layout(width: number, height: number, icon: DOMRect, bubble: DOMRect) {
      Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: width });
      Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
      const tooltip = screen.getByRole("tooltip");
      vi.spyOn(tooltip.parentElement as HTMLElement, "getBoundingClientRect").mockReturnValue(icon);
      vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(bubble);
    }

    function hover() {
      fireEvent.pointerEnter(screen.getByRole("button"));
      return screen.getByRole("tooltip");
    }

    afterEach(() => {
      vi.restoreAllMocks();
      for (const side of ["clientWidth", "clientHeight"]) {
        Object.defineProperty(document.documentElement, side, { configurable: true, value: 0 });
      }
    });

    it("leaves the bubble where it opens when it fits", () => {
      render(<InfoTip label="Info" text="Teks" />);
      layout(1024, 768, box(600, 300, 16, 16), box(600, 322, 260, 90));

      expect(hover().style.transform).toBe("");
    });

    it("pulls the bubble back inside when it would run past the right edge, keeping a margin", () => {
      render(<InfoTip label="Info" text="Teks" />);
      layout(375, 800, box(289, 400, 16, 16), box(289, 422, 260, 90));

      // Its right edge at 549 is 174 past the window; 8 more leaves a margin.
      expect(hover().style.transform).toBe("translate(-182px, 0px)");
    });

    it("never pulls it past the left edge on a window narrower than the bubble", () => {
      render(<InfoTip label="Info" text="Teks" />);
      layout(200, 800, box(100, 400, 16, 16), box(100, 422, 260, 90));

      expect(hover().style.transform).toBe("translate(-92px, 0px)");
    });

    it("pushes an end-aligned bubble back inside when it would run past the left edge", () => {
      render(<InfoTip label="Info" text="Teks" align="end" />);
      layout(375, 800, box(20, 400, 16, 16), box(-224, 422, 260, 90));

      expect(hover().style.transform).toBe("translate(232px, 0px)");
    });

    it("opens the bubble above the icon when it would run past the bottom and there is room", () => {
      render(<InfoTip label="Info" text="Teks" />);
      layout(1024, 700, box(600, 640, 16, 16), box(600, 662, 260, 90));

      // It ends 6 px above the icon, as it starts 6 px below it.
      expect(hover().style.transform).toBe("translate(0px, -118px)");
    });

    it("keeps the bubble below when there is no room above either", () => {
      render(<InfoTip label="Info" text="Teks" />);
      layout(1024, 100, box(600, 40, 16, 16), box(600, 62, 260, 90));

      expect(hover().style.transform).toBe("");
    });

    it("places the bubble when the icon is reached by keyboard too", () => {
      render(<InfoTip label="Info" text="Teks" />);
      layout(375, 800, box(289, 400, 16, 16), box(289, 422, 260, 90));

      act(() => screen.getByRole("button").focus());

      expect(screen.getByRole("tooltip").style.transform).toBe("translate(-182px, 0px)");
    });

    // A window widened after a first opening must not keep the offset measured for the old one.
    it("measures afresh each time it opens", () => {
      render(<InfoTip label="Info" text="Teks" />);
      layout(375, 800, box(289, 400, 16, 16), box(289, 422, 260, 90));
      hover();
      vi.restoreAllMocks();
      layout(1024, 768, box(289, 400, 16, 16), box(289, 422, 260, 90));

      expect(hover().style.transform).toBe("");
    });
  });
});
