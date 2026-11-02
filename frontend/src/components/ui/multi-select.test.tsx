import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MultiSelect } from "./multi-select";
import { expectPhoneTarget } from "@/test/touch-target";

const OPTIONS = [
  { value: "id-1", label: "Salsa" },
  { value: "id-2", label: "Rangga" },
  { value: "id-3", label: "Lestari" },
];

function renderSelect(selected: string[] = [], onChange = vi.fn()) {
  render(<MultiSelect label="Creator" options={OPTIONS} selected={selected} onChange={onChange} />);
  return onChange;
}

function trigger() {
  return screen.getByRole("button", { name: /^Creator:/ });
}

describe("MultiSelect", () => {
  it("says Semua under its label while nothing is picked", () => {
    renderSelect();
    expect(trigger()).toHaveTextContent("Creator: Semua");
  });

  it("counts the picks once some are", () => {
    renderSelect(["id-1", "id-3"]);
    expect(trigger()).toHaveTextContent("Creator: 2 dipilih");
  });

  it("opens on click and closes on Escape", () => {
    renderSelect();
    expect(screen.queryByRole("group", { name: "Creator" })).not.toBeInTheDocument();

    fireEvent.click(trigger());
    expect(screen.getByRole("group", { name: "Creator" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Creator" })).not.toBeInTheDocument();
  });

  it("closes when the click lands outside it", () => {
    render(
      <>
        <p>di luar</p>
        <MultiSelect label="Creator" options={OPTIONS} selected={[]} onChange={vi.fn()} />
      </>,
    );
    fireEvent.click(trigger());
    fireEvent.mouseDown(screen.getByText("di luar"));
    expect(screen.queryByRole("group", { name: "Creator" })).not.toBeInTheDocument();
  });

  it("reports a pick the checkbox adds and an unpick the checkbox removes", () => {
    const onChange = renderSelect(["id-1"]);

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("checkbox", { name: "Rangga" }));
    expect(onChange).toHaveBeenLastCalledWith(["id-1", "id-2"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Salsa" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("shows the picked names as chips that drop one at a time", () => {
    const onChange = renderSelect(["id-1", "id-2"]);

    expect(
      screen.getByRole("button", { name: "Hapus filter Creator: Salsa" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hapus filter Creator: Rangga" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Creator: Salsa" }));
    expect(onChange).toHaveBeenLastCalledWith(["id-2"]);
  });

  it("keeps no chip of a pick that is no longer selected", () => {
    renderSelect(["id-1"]);
    expect(
      screen.getByRole("button", { name: "Hapus filter Creator: Salsa" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rangga/ })).not.toBeInTheDocument();
  });

  it("reads a chip by its raw value when its option is gone", () => {
    renderSelect(["id-x"]);
    expect(
      screen.getByRole("button", { name: "Hapus filter Creator: id-x" }),
    ).toBeInTheDocument();
  });

  it("ignores a key that is not Escape and a press that lands inside it", () => {
    renderSelect();
    fireEvent.click(trigger());

    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("group", { name: "Creator" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("group", { name: "Creator" }));
    expect(screen.getByRole("group", { name: "Creator" })).toBeInTheDocument();
  });
});

// Subtask 5.3: the dropdown as the prototype draws and behaves it.
describe("MultiSelect, as the prototype's chip dropdown", () => {
  /** Holds the selection the way a page does, so a pick shows up in the next render. */
  function Stateful({ initial = [] as string[] }) {
    const [selected, setSelected] = useState<string[]>(initial);
    return (
      <>
        <button type="button">di luar</button>
        <MultiSelect label="Creator" options={OPTIONS} selected={selected} onChange={setSelected} />
      </>
    );
  }

  function open() {
    fireEvent.click(trigger());
    return screen.getByRole("group", { name: "Creator" });
  }

  describe("summary on the trigger", () => {
    it("names the pick itself when there is exactly one", () => {
      renderSelect(["id-2"]);

      expect(trigger()).toHaveTextContent("Creator: Rangga");
    });

    it("falls back to the raw value for a single pick whose option is gone", () => {
      renderSelect(["id-gone"]);

      expect(trigger()).toHaveTextContent("Creator: id-gone");
    });

    it.each([
      [[], "Creator: Semua"],
      [["id-1", "id-2"], "Creator: 2 dipilih"],
      [["id-1", "id-2", "id-3"], "Creator: 3 dipilih"],
    ])("reads %j as %s", (selected, text) => {
      renderSelect(selected);

      expect(trigger()).toHaveTextContent(text);
    });
  });

  describe("the Semua option", () => {
    it("comes first in the popup and is ticked while nothing is picked", () => {
      renderSelect();

      const popup = open();
      const boxes = within(popup).getAllByRole("checkbox");

      expect(boxes).toHaveLength(OPTIONS.length + 1);
      expect(within(popup).getByRole("checkbox", { name: "Semua" })).toBe(boxes[0]);
      expect(boxes[0]).toBeChecked();
    });

    it("is unticked as soon as something is picked", () => {
      renderSelect(["id-1"]);

      expect(within(open()).getByRole("checkbox", { name: "Semua" })).not.toBeChecked();
    });

    it("clears every pick in one press", () => {
      const onChange = renderSelect(["id-1", "id-3"]);

      fireEvent.click(within(open()).getByRole("checkbox", { name: "Semua" }));

      expect(onChange).toHaveBeenCalledWith([]);
    });

    // Pressing it while it is already ticked changes nothing, so it must not report a change:
    // on the Content Plan that was a navigation that threw page 3 back to page 1.
    it("reports nothing when pressed while nothing is picked", () => {
      const onChange = renderSelect();

      fireEvent.click(within(open()).getByRole("checkbox", { name: "Semua" }));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("checkbox", { name: "Semua" })).toBeChecked();
    });

    it("drops every chip once pressed", () => {
      render(<Stateful initial={["id-1", "id-3"]} />);

      fireEvent.click(within(open()).getByRole("checkbox", { name: "Semua" }));

      expect(screen.queryByRole("button", { name: /^Hapus filter/ })).not.toBeInTheDocument();
      expect(trigger()).toHaveTextContent("Creator: Semua");
    });
  });

  describe("staying open", () => {
    it("keeps the popup open across picks, so several can be ticked in one go", () => {
      render(<Stateful />);
      const popup = open();

      fireEvent.click(within(popup).getByRole("checkbox", { name: "Salsa" }));
      fireEvent.click(within(popup).getByRole("checkbox", { name: "Lestari" }));

      expect(screen.getByRole("group", { name: "Creator" })).toBeInTheDocument();
      expect(trigger()).toHaveTextContent("Creator: 2 dipilih");
      expect(screen.getByRole("button", { name: "Hapus filter Creator: Salsa" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hapus filter Creator: Lestari" })).toBeInTheDocument();
    });

    it("drops one chip and leaves the other picks alone", () => {
      render(<Stateful initial={["id-1", "id-2", "id-3"]} />);

      fireEvent.click(screen.getByRole("button", { name: "Hapus filter Creator: Rangga" }));

      expect(screen.queryByRole("button", { name: "Hapus filter Creator: Rangga" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hapus filter Creator: Salsa" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hapus filter Creator: Lestari" })).toBeInTheDocument();
      expect(trigger()).toHaveTextContent("Creator: 2 dipilih");
    });

    it("goes back to the pick's name when chips are dropped down to one", () => {
      render(<Stateful initial={["id-1", "id-2"]} />);

      fireEvent.click(screen.getByRole("button", { name: "Hapus filter Creator: Salsa" }));

      expect(trigger()).toHaveTextContent("Creator: Rangga");
    });
  });

  describe("keyboard and screen readers", () => {
    it("tells assistive technology the trigger opens a popup, and whether it is open", () => {
      renderSelect();

      expect(trigger()).toHaveAttribute("aria-haspopup", "true");
      expect(trigger()).toHaveAttribute("aria-expanded", "false");

      open();

      expect(trigger()).toHaveAttribute("aria-expanded", "true");
    });

    it("hands focus back to the trigger when Escape closes the popup", () => {
      renderSelect();
      const popup = open();
      within(popup).getByRole("checkbox", { name: "Salsa" }).focus();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(trigger()).toHaveFocus();
    });

    it("leaves focus where the press landed when a click outside closes the popup", () => {
      render(<Stateful />);
      open();
      const outside = screen.getByRole("button", { name: "di luar" });
      outside.focus();

      fireEvent.mouseDown(outside);

      expect(screen.queryByRole("group", { name: "Creator" })).not.toBeInTheDocument();
      expect(outside).toHaveFocus();
    });

    it("does not pull focus on Escape while the popup is closed", () => {
      render(<Stateful />);
      const outside = screen.getByRole("button", { name: "di luar" });
      outside.focus();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(outside).toHaveFocus();
    });
  });

  describe("look", () => {
    it("draws the trigger as a pill with a quiet label and a strong value", () => {
      renderSelect(["id-2"]);

      expect(trigger()).toHaveClass("rounded-full");
      expect(screen.getByText("Creator:")).toHaveClass("text-muted");
      expect(screen.getByText("Rangga", { selector: "b" })).toHaveClass("font-semibold");
    });

    // In the open phone filter card every control is a full-width field (approved design); the
    // pill stayed its own width and left Creator, Tipe and Status ragged under the selects.
    it("spans the phone filter card as a field, and stays a pill from sm up", () => {
      renderSelect();

      expect(trigger()).toHaveClass("rounded-full", "max-sm:w-full", "max-sm:rounded-(--radius-control)");
      expect(trigger().parentElement).toHaveClass("max-sm:w-full");
      expect(trigger().closest("div")).toHaveClass("max-sm:w-full");
    });

    it("opens the popup under the trigger, never over it", () => {
      renderSelect();

      const popup = open();

      // Without an anchor an absolute box sits at its container's top-left corner, which is
      // where the trigger is: the popup would cover the control that opened it.
      expect(popup).toHaveClass("absolute", "top-full", "left-0");
      expect(popup.parentElement).toHaveClass("relative");
    });

    // The chips sit beside the trigger and wrap onto more rows as picks are added. Anchored to
    // the box that holds them too, the popup opened under the last row of chips, away from
    // the trigger that opened it.
    it("anchors the popup to the trigger alone, not to the chips beside it", () => {
      renderSelect(["id-1", "id-2", "id-3"]);

      const anchor = open().parentElement as HTMLElement;

      expect(anchor).toHaveClass("relative");
      expect(anchor).toContainElement(trigger());
      expect(anchor).not.toContainElement(
        screen.getByRole("button", { name: "Hapus filter Creator: Salsa" }),
      );
    });

    it("still counts a press on a chip as inside, so dropping one keeps the popup open", () => {
      render(<Stateful initial={["id-1", "id-2"]} />);
      open();

      const chip = screen.getByRole("button", { name: "Hapus filter Creator: Salsa" });
      fireEvent.mouseDown(chip);
      fireEvent.click(chip);

      expect(screen.getByRole("group", { name: "Creator" })).toBeInTheDocument();
    });

    // On a phone the second filter sits mid-row, and a popup opened from its left edge ran
    // 52 px past the right of the window.
    describe("near the right edge of the window", () => {
      /** The popup is 240 px wide; where its right edge falls says where the trigger sits. */
      function windowIs(width: number, popupRight: number) {
        Object.defineProperty(document.documentElement, "clientWidth", {
          configurable: true,
          value: width,
        });
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
          left: popupRight - 240,
          right: popupRight,
        } as DOMRect);
      }

      afterEach(() => {
        vi.restoreAllMocks();
        Object.defineProperty(document.documentElement, "clientWidth", {
          configurable: true,
          value: 0,
        });
      });

      it("pulls the popup back inside when it would run past the edge, keeping a margin", () => {
        windowIs(375, 427);
        renderSelect();

        // 427 is 52 past the window; 8 more leaves a margin.
        expect(open().style.left).toBe("-60px");
      });

      it("leaves the popup at the trigger's left edge when it fits", () => {
        windowIs(1024, 729);
        renderSelect();

        expect(open().style.left).toBe("");
      });

      it("leaves it alone when it ends exactly at the margin", () => {
        windowIs(375, 367);
        renderSelect();

        expect(open().style.left).toBe("");
      });

      // A pick adds a chip, the filter wraps to a row of its own and the trigger lands at the
      // left edge. The offset measured when the popup opened then put it 23 px off-screen.
      it("measures again after a pick has moved the trigger", () => {
        windowIs(375, 427);
        render(<Stateful />);
        const popup = open();
        expect(popup.style.left).toBe("-60px");

        windowIs(375, 277);
        fireEvent.click(within(popup).getByRole("checkbox", { name: "Salsa" }));

        expect(popup.style.left).toBe("");
      });

      it("never pulls the popup past the window's left edge, however narrow the window", () => {
        // 300 is 108 past a 200 px window's margin, but only 52 px separate the popup from
        // the left margin.
        windowIs(200, 300);
        renderSelect();

        expect(open().style.left).toBe("-52px");
      });
    });

    it("marks the trigger while its popup is open", () => {
      renderSelect();
      expect(trigger()).not.toHaveClass("border-ink");

      open();

      expect(trigger()).toHaveClass("border-ink");
    });

    it("ticks its checkboxes in the brand colour", () => {
      renderSelect(["id-1"]);

      for (const box of within(open()).getAllByRole("checkbox")) {
        expect(box).toHaveClass("accent-accent");
      }
    });
  });
});

// Measured at 375px: the trigger was 32px tall and each pick's chip 20px. On a phone they are the
// presses that narrow the list and widen it again, so each gets 44px.
describe("MultiSelect on a phone", () => {
  it("gives the trigger and each pick's chip a 44px press", () => {
    renderSelect(["id-1"]);

    expectPhoneTarget(screen.getByRole("button", { name: /^Creator:/ }));
    expectPhoneTarget(screen.getByRole("button", { name: /^Hapus filter Creator:/ }));
  });
});
