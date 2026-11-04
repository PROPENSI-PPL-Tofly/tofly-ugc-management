import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { CODE_LENGTH, CodeBoxes } from "./code-boxes";

/** The boxes with their value held the way the sign-in screen holds it. */
function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <CodeBoxes
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
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
  it("shows six single-digit boxes in a named group (AC 7)", () => {
    render(<Harness />);

    expect(CODE_LENGTH).toBe(6);
    expect(screen.getByRole("group", { name: "Kode 6 digit" })).toBeInTheDocument();
    expect(boxes()).toHaveLength(6);
    boxes().forEach((box, index) => {
      expect(box).toHaveAccessibleName(`Digit ${index + 1} dari 6`);
      expect(box).toHaveAttribute("inputmode", "numeric");
      expect(box).toHaveAttribute("maxlength", "1");
    });
  });

  it("lets the phone offer the code from the email on the first box", () => {
    render(<Harness />);

    expect(boxes()[0]).toHaveAttribute("autocomplete", "one-time-code");
    expect(boxes()[1]).toHaveAttribute("autocomplete", "off");
  });

  it("takes a typed digit and moves on to the next box", () => {
    render(<Harness />);

    fireEvent.change(boxes()[0], { target: { value: "4" } });

    expect(values()).toBe("4_____");
    expect(boxes()[1]).toHaveFocus();
  });

  it("ignores anything that is not a digit", () => {
    render(<Harness />);

    fireEvent.change(boxes()[0], { target: { value: "a" } });

    expect(values()).toBe("______");
    expect(boxes()[0]).not.toHaveFocus();
  });

  it("stays on the last box once it is filled", () => {
    render(<Harness initial="12345" />);
    boxes()[5].focus();

    fireEvent.change(boxes()[5], { target: { value: "6" } });

    expect(values()).toBe("123456");
    expect(boxes()[5]).toHaveFocus();
  });

  it("replaces a digit typed over an existing one", () => {
    render(<Harness initial="123456" />);

    fireEvent.change(boxes()[2], { target: { value: "9" } });

    expect(values()).toBe("129456");
  });

  it("clears a box when its digit is deleted", () => {
    render(<Harness initial="123456" />);

    fireEvent.change(boxes()[5], { target: { value: "" } });

    expect(values()).toBe("12345_");
  });

  it("goes back and clears the previous box on Backspace in an empty one", () => {
    render(<Harness initial="12" />);
    boxes()[2].focus();

    fireEvent.keyDown(boxes()[2], { key: "Backspace" });

    expect(values()).toBe("1_____");
    expect(boxes()[1]).toHaveFocus();
  });

  it.each([
    ["a filled box", "12", 1],
    ["the first box", "", 0],
  ])("leaves Backspace alone in %s", (_label, initial, index) => {
    render(<Harness initial={initial} />);
    boxes()[index].focus();

    fireEvent.keyDown(boxes()[index], { key: "Backspace" });

    expect(values()).toBe(`${initial}${"_".repeat(6 - initial.length)}`);
    expect(boxes()[index]).toHaveFocus();
  });

  it("ignores other keys", () => {
    render(<Harness initial="1" />);
    boxes()[1].focus();

    fireEvent.keyDown(boxes()[1], { key: "ArrowLeft" });

    expect(values()).toBe("1_____");
  });

  it.each([
    ["the code", "482913"],
    ["the code with spaces", " 482 913 "],
    ["the code inside a sentence", "Kode masuk: 482913."],
  ])("fills every box from a pasted code, whichever box it lands in: %s", (_label, text) => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    fireEvent.paste(boxes()[3], { clipboardData: { getData: () => text } });

    expect(values()).toBe("482913");
    expect(onValue).toHaveBeenLastCalledWith("482913");
    expect(boxes()[5]).toHaveFocus();
  });

  it("fills what it can from a short paste and puts the cursor after it", () => {
    render(<Harness />);

    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => "48" } });

    expect(values()).toBe("48____");
    expect(boxes()[2]).toHaveFocus();
  });

  it("keeps the first six digits of a long paste", () => {
    render(<Harness />);

    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => "12345678" } });

    expect(values()).toBe("123456");
  });

  it("ignores a paste with no digits", () => {
    const onValue = vi.fn();
    render(<Harness initial="1" onValue={onValue} />);

    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => "kode" } });

    expect(onValue).not.toHaveBeenCalled();
    expect(values()).toBe("1_____");
  });

  it("takes a whole code the browser fills into one box, as a paste", () => {
    render(<Harness />);

    fireEvent.change(boxes()[0], { target: { value: "482913" } });

    expect(values()).toBe("482913");
  });

  it("can be disabled while a code is checked and marked invalid after a wrong one", () => {
    render(<CodeBoxes value="" onChange={vi.fn()} disabled invalid describedBy="code-error" />);

    boxes().forEach((box) => {
      expect(box).toBeDisabled();
      expect(box).toHaveAttribute("aria-invalid", "true");
      expect(box).toHaveAttribute("aria-describedby", "code-error");
    });
  });
});
