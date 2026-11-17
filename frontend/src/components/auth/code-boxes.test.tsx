import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { CodeBoxes } from "./code-boxes";

/** The boxes as the sign-in screen holds them: the code lives in its state, nowhere else. */
function Harness({
  initial = "",
  disabled = false,
  invalid = false,
  onCode = () => {},
}: {
  initial?: string;
  disabled?: boolean;
  invalid?: boolean;
  onCode?: (code: string) => void;
}) {
  const [code, setCode] = useState(initial);
  return (
    <CodeBoxes
      value={code}
      onChange={(next) => {
        setCode(next);
        onCode(next);
      }}
      disabled={disabled}
      invalid={invalid}
      describedBy="code-help"
    />
  );
}

function boxes(): HTMLInputElement[] {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

function values(): string {
  return boxes()
    .map((box) => box.value || "_")
    .join("");
}

describe("CodeBoxes", () => {
  it("draws six single-digit boxes named for screen readers, with a numeric keyboard", () => {
    render(<Harness />);

    expect(boxes()).toHaveLength(6);
    boxes().forEach((box, index) => {
      expect(box).toHaveAccessibleName(`Digit ${index + 1} dari 6`);
      expect(box).toHaveAttribute("inputmode", "numeric");
      expect(box).toHaveAttribute("aria-describedby", "code-help");
    });
  });

  it("shares the row's width between the six boxes, so all six fit a 320 px screen", () => {
    render(<Harness />);

    const boxes = screen.getAllByRole("textbox");
    expect(boxes[0].parentElement).toHaveClass("grid", "grid-cols-6");
    for (const box of boxes) {
      expect(box).toHaveClass("w-full", "min-w-0");
      expect(box).not.toHaveClass("size-11");
    }
  });

  it("offers the phone's one-time-code autofill on the first box only", () => {
    render(<Harness />);

    expect(boxes()[0]).toHaveAttribute("autocomplete", "one-time-code");
    boxes()
      .slice(1)
      .forEach((box) => expect(box).toHaveAttribute("autocomplete", "off"));
  });

  it("fills a box with a typed digit and moves on to the next", () => {
    const onCode = vi.fn();
    render(<Harness onCode={onCode} />);

    fireEvent.change(boxes()[0], { target: { value: "4" } });

    expect(values()).toBe("4_____");
    expect(onCode).toHaveBeenLastCalledWith("4");
    expect(boxes()[1]).toHaveFocus();
  });

  it("ignores anything that is not a digit", () => {
    const onCode = vi.fn();
    render(<Harness onCode={onCode} />);

    fireEvent.change(boxes()[0], { target: { value: "a" } });

    expect(values()).toBe("______");
    expect(onCode).not.toHaveBeenCalled();
  });

  it("replaces a filled box's digit with the one typed over it", () => {
    render(<Harness initial="123456" />);

    fireEvent.change(boxes()[2], { target: { value: "39" } });

    expect(values()).toBe("129456");
    expect(boxes()[3]).toHaveFocus();
  });

  it("stays on the last box once it is filled", () => {
    render(<Harness initial="12345" />);
    boxes()[5].focus();

    fireEvent.change(boxes()[5], { target: { value: "6" } });

    expect(values()).toBe("123456");
    expect(boxes()[5]).toHaveFocus();
  });

  it("spreads a whole code that lands in one box, as autofill does, over all six", () => {
    const onCode = vi.fn();
    render(<Harness onCode={onCode} />);

    fireEvent.change(boxes()[0], { target: { value: "987654" } });

    expect(values()).toBe("987654");
    expect(onCode).toHaveBeenLastCalledWith("987654");
    expect(boxes()[5]).toHaveFocus();
  });

  it("fills all six boxes from a pasted code, whatever box it is pasted into", () => {
    const onCode = vi.fn();
    render(<Harness onCode={onCode} />);

    fireEvent.paste(boxes()[3], { clipboardData: { getData: () => "123456" } });

    expect(values()).toBe("123456");
    expect(onCode).toHaveBeenLastCalledWith("123456");
    expect(boxes()[5]).toHaveFocus();
  });

  it("keeps only the digits of a pasted code, as an email client may copy spaces or dashes", () => {
    render(<Harness />);

    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => " 12-34 56\n" } });

    expect(values()).toBe("123456");
  });

  it("fills from the box pasted into when fewer than six digits are pasted", () => {
    render(<Harness initial="9" />);

    fireEvent.paste(boxes()[1], { clipboardData: { getData: () => "12" } });

    expect(values()).toBe("912___");
    expect(boxes()[3]).toHaveFocus();
  });

  it("ignores a paste without digits", () => {
    const onCode = vi.fn();
    render(<Harness onCode={onCode} />);

    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => "kode" } });

    expect(values()).toBe("______");
    expect(onCode).not.toHaveBeenCalled();
  });

  it("clears a filled box on Backspace and stays there", () => {
    render(<Harness initial="123" />);
    boxes()[2].focus();

    fireEvent.keyDown(boxes()[2], { key: "Backspace" });

    expect(values()).toBe("12____");
    expect(boxes()[2]).toHaveFocus();
  });

  it("steps back and clears the previous box on Backspace in an empty one", () => {
    render(<Harness initial="123" />);
    boxes()[3].focus();

    fireEvent.keyDown(boxes()[3], { key: "Backspace" });

    expect(values()).toBe("12____");
    expect(boxes()[2]).toHaveFocus();
  });

  it("does nothing on Backspace in the first box when it is empty", () => {
    const onCode = vi.fn();
    render(<Harness onCode={onCode} />);
    boxes()[0].focus();

    fireEvent.keyDown(boxes()[0], { key: "Backspace" });

    expect(boxes()[0]).toHaveFocus();
    expect(onCode).not.toHaveBeenCalled();
  });

  it("moves between boxes with the arrow keys, stopping at either end", () => {
    render(<Harness />);
    boxes()[0].focus();

    fireEvent.keyDown(boxes()[0], { key: "ArrowLeft" });
    expect(boxes()[0]).toHaveFocus();
    fireEvent.keyDown(boxes()[0], { key: "ArrowRight" });
    expect(boxes()[1]).toHaveFocus();
    fireEvent.keyDown(boxes()[1], { key: "ArrowLeft" });
    expect(boxes()[0]).toHaveFocus();
    boxes()[5].focus();
    fireEvent.keyDown(boxes()[5], { key: "ArrowRight" });
    expect(boxes()[5]).toHaveFocus();
  });

  it("leaves other keys to the browser", () => {
    render(<Harness initial="1" />);
    boxes()[0].focus();

    fireEvent.keyDown(boxes()[0], { key: "Tab" });

    expect(values()).toBe("1_____");
  });

  it("disables every box while the code is being checked", () => {
    render(<Harness disabled />);

    boxes().forEach((box) => expect(box).toBeDisabled());
  });

  it("marks every box invalid when the code was refused", () => {
    render(<Harness invalid />);

    boxes().forEach((box) => expect(box).toHaveAttribute("aria-invalid", "true"));
  });
});
