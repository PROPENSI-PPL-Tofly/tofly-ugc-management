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

  // The bubble once hung inside the table it explained, and a scrolling table cut it off at its
  // edge (the last row of Performa Konten lost it under the pagination). It is placed on the
  // screen layer instead, against the icon, and kept inside the window. jsdom lays nothing out,
  // so the boxes a browser would measure are stubbed in.
  describe("placed against its icon, on the screen layer", () => {
    function box(left: number, top: number, width: number, height: number): DOMRect {
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
    }

    function window(width: number, height: number) {
      Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: width });
      Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
    }

    /** Renders the tip inside a clipping, scrolling box, with the icon and bubble measured as given. */
    function openAt(icon: DOMRect, bubble: DOMRect, align: "start" | "end" = "start") {
      render(
        <div style={{ overflow: "auto" }}>
          <InfoTip label="Info" text="Teks" align={align} />
        </div>,
      );
      const tooltip = screen.getByRole("tooltip");
      const iconSpy = vi.spyOn(tooltip.parentElement as HTMLElement, "getBoundingClientRect").mockReturnValue(icon);
      vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(bubble);
      fireEvent.focus(screen.getByRole("button", { name: "Info" }));
      return { tooltip, iconSpy };
    }

    afterEach(() => {
      vi.restoreAllMocks();
      window(0, 0);
    });

    it("is fixed to the screen, so no scrolling area it sits in can cut it off", () => {
      render(<InfoTip label="Info" text="Teks" />);

      expect(screen.getByRole("tooltip")).toHaveClass("fixed");
    });

    it("takes no room while closed, so it can never widen what it sits in", () => {
      render(<InfoTip label="Info" text="Teks" />);

      expect(screen.getByRole("tooltip")).toHaveClass("hidden", "group-hover:block");
    });

    it("opens 6px below the icon, lined up with its left edge", async () => {
      window(1024, 800);
      const { tooltip } = openAt(box(100, 200, 16, 16), box(0, 0, 260, 90));

      await waitFor(() => expect(tooltip.style.top).toBe("222px"));
      expect(tooltip.style.left).toBe("100px");
    });

    it("lines up with the icon's right edge when asked", async () => {
      window(1024, 800);
      const { tooltip } = openAt(box(600, 200, 16, 16), box(0, 0, 260, 90), "end");

      await waitFor(() => expect(tooltip.style.left).toBe("356px"));
    });

    it("opens above the icon when it would run past the bottom and there is room", async () => {
      window(1024, 700);
      const { tooltip } = openAt(box(600, 640, 16, 16), box(0, 0, 260, 90));

      // It ends 6 px above the icon, as it starts 6 px below it.
      await waitFor(() => expect(tooltip.style.top).toBe("544px"));
      expect(tooltip).toHaveAttribute("data-above");
    });

    it("keeps below when there is no room above either", async () => {
      window(1024, 100);
      const { tooltip } = openAt(box(600, 40, 16, 16), box(0, 0, 260, 90));

      await waitFor(() => expect(tooltip.style.top).toBe("62px"));
      expect(tooltip).not.toHaveAttribute("data-above");
    });

    it("is pulled back inside the window near its right edge, 8px clear of it", async () => {
      window(375, 800);
      const { tooltip } = openAt(box(300, 200, 16, 16), box(0, 0, 260, 90));

      // 375 - 8 - 260
      await waitFor(() => expect(tooltip.style.left).toBe("107px"));
    });

    it("is pushed back inside the window near its left edge", async () => {
      window(375, 800);
      const { tooltip } = openAt(box(84, 200, 16, 16), box(0, 0, 260, 90), "end");

      await waitFor(() => expect(tooltip.style.left).toBe("8px"));
    });

    // A window made taller after a first opening must not keep the place measured for the old one.
    it("measures afresh each time it opens", async () => {
      window(1024, 700);
      const { tooltip } = openAt(box(600, 640, 16, 16), box(0, 0, 260, 90));
      await waitFor(() => expect(tooltip).toHaveAttribute("data-above"));
      const button = screen.getByRole("button", { name: "Info" });
      fireEvent.blur(button);
      window(1024, 1000);

      fireEvent.focus(button);

      await waitFor(() => expect(tooltip.style.top).toBe("662px"));
      expect(tooltip).not.toHaveAttribute("data-above");
    });

    it("follows its icon when the page scrolls while it is open", async () => {
      window(1024, 800);
      const { tooltip, iconSpy } = openAt(box(100, 200, 16, 16), box(0, 0, 260, 90));
      await waitFor(() => expect(tooltip.style.top).toBe("222px"));

      iconSpy.mockReturnValue(box(100, 150, 16, 16));
      fireEvent.scroll(document);

      await waitFor(() => expect(tooltip.style.top).toBe("172px"));
    });
  });

  // A phone browser need not focus a button it is tapped on (Safari does not), so a bubble that
  // opened on focus alone never opened under a finger. A tap opens it, and it closes the ways a
  // tooltip should: Escape, leaving it, or a press anywhere else.
  describe("on a touch screen", () => {
    it("opens on a tap, focused or not", () => {
      render(<InfoTip label="Info" text="Teks" />);

      fireEvent.click(screen.getByRole("button", { name: "Info" }));

      expect(screen.getByRole("tooltip")).toHaveClass("block");
      expect(screen.getByRole("tooltip")).not.toHaveClass("hidden");
    });

    it("stays open when the tap also focused it", () => {
      render(<InfoTip label="Info" text="Teks" />);
      const button = screen.getByRole("button", { name: "Info" });

      fireEvent.focus(button);
      fireEvent.click(button);

      expect(screen.getByRole("tooltip")).toHaveClass("block");
    });

    it("closes on Escape without moving focus", () => {
      render(<InfoTip label="Info" text="Teks" />);
      const button = screen.getByRole("button", { name: "Info" });
      button.focus();
      fireEvent.click(button);
      expect(screen.getByRole("tooltip")).toHaveClass("block");

      fireEvent.keyDown(button, { key: "Escape" });

      expect(screen.getByRole("tooltip")).toHaveClass("hidden");
      expect(button).toHaveFocus();
    });

    it("closes on a press anywhere else", () => {
      render(
        <>
          <InfoTip label="Info" text="Teks" />
          <p>Di luar</p>
        </>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Info" }));
      expect(screen.getByRole("tooltip")).toHaveClass("block");

      fireEvent.pointerDown(screen.getByText("Di luar"));

      expect(screen.getByRole("tooltip")).toHaveClass("hidden");
    });

    it("closes when focus leaves it", () => {
      render(<InfoTip label="Info" text="Teks" />);
      const button = screen.getByRole("button", { name: "Info" });
      fireEvent.focus(button);
      fireEvent.click(button);
      expect(screen.getByRole("tooltip")).toHaveClass("block");

      fireEvent.blur(button);

      expect(screen.getByRole("tooltip")).toHaveClass("hidden");
    });

    it("opens on keyboard focus alone", () => {
      render(<InfoTip label="Info" text="Teks" />);

      fireEvent.focus(screen.getByRole("button", { name: "Info" }));

      expect(screen.getByRole("tooltip")).toHaveClass("block");
    });

    // Measured at 375px on Rate & Invoicing: a tap on the open Total bubble went through it to
    // the cell beneath, and the press counted as one elsewhere, so the bubble being read shut.
    // The bubble takes its own presses now; jsdom does no hit-testing, so the browser checks it.
    it("takes a press on its own open bubble, which stays open", () => {
      render(<InfoTip label="Info" text="Teks" />);
      fireEvent.click(screen.getByRole("button", { name: "Info" }));
      const tooltip = screen.getByRole("tooltip");

      expect(tooltip).not.toHaveClass("pointer-events-none");
      fireEvent.pointerDown(tooltip);

      expect(tooltip).toHaveClass("block");
    });

    // Measured at 375px: the tap on the bubble took focus off the button it opened from, and
    // the blur shut it. Pressing the bubble leaves focus where it is.
    it("keeps focus on the button, and the bubble open, when the bubble is pressed", () => {
      render(<InfoTip label="Info" text="Teks" />);
      const button = screen.getByRole("button", { name: "Info" });
      button.focus();
      fireEvent.click(button);
      const tooltip = screen.getByRole("tooltip");

      const focusMoved = fireEvent.mouseDown(tooltip);

      expect(focusMoved).toBe(false);
      expect(button).toHaveFocus();
      expect(tooltip).toHaveClass("block");
    });
  });

  // Measured at 1280px: the bubble shut the moment the pointer reached it, so a long explanation
  // could not be followed with the pointer (a tablet's trackpad included). The bubble sits 6px
  // below the icon; a strip above it covers that gap, so the pointer never leaves the tip.
  it("keeps the bubble open as the pointer crosses from the icon onto it", () => {
    render(<InfoTip label="Info" text="Teks" />);
    const tooltip = screen.getByRole("tooltip");

    expect(tooltip).toHaveClass("group-hover:block");
    expect(tooltip).not.toHaveClass("pointer-events-none");
    expect(tooltip).toHaveClass("before:absolute", "before:inset-x-0", "before:-top-1.5", "before:h-1.5");
  });
});
