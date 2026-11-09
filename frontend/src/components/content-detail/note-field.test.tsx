import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { REQUIRED_MARK } from "@/components/ui/form-classes";
import { NoteField, type NoteFieldProps } from "./note-field";

const BASE: Omit<NoteFieldProps, "value" | "onChange"> = {
  label: "Catatan susulan",
  placeholder: "mis. Tambahan untuk bagian intro...",
  required: true,
  missingMessage: "Catatan susulan wajib diisi sebelum dikirim.",
  max: 20,
};

// Controlled like the forms that use it, so typing moves the counter.
function Harness(props: Partial<NoteFieldProps>) {
  const [value, setValue] = useState(props.value ?? "");
  return <NoteField {...BASE} {...props} value={value} onChange={setValue} />;
}

function field() {
  return screen.getByRole("textbox", { name: "Catatan susulan" });
}

describe("NoteField", () => {
  it("labels a required note with the shared asterisk and takes focus when it opens", () => {
    render(<Harness />);

    expect(field()).toBeRequired();
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute("maxLength", "20");
    expect(field()).toHaveAttribute("placeholder", BASE.placeholder);
    expect(screen.getByText("Catatan susulan")).toHaveClass(...REQUIRED_MARK.split(" "));
  });

  it("leaves an optional note unmarked and never flags it as invalid", () => {
    render(<Harness required={false} missingMessage={undefined} />);

    expect(screen.getByText("Catatan susulan")).not.toHaveClass("after:content-['*']");
    fireEvent.blur(field());
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("only says a required note is missing once the field was left empty", () => {
    render(<Harness />);

    expect(screen.queryByText(BASE.missingMessage!)).toBeNull();
    expect(field()).toHaveAttribute("aria-invalid", "false");

    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.blur(field());

    const message = screen.getByText(BASE.missingMessage!);
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field().getAttribute("aria-describedby")).toContain(message.id);

    fireEvent.change(field(), { target: { value: "Ada" } });
    expect(screen.queryByText(BASE.missingMessage!)).toBeNull();
  });

  it("counts what was typed against the limit and says so once the note is full", () => {
    render(<Harness />);

    fireEvent.change(field(), { target: { value: "Halo" } });
    expect(screen.getByText("4/20")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(field(), { target: { value: "x".repeat(20) } });
    expect(screen.getByRole("alert")).toHaveTextContent("Maksimal 20 karakter");
  });

  it("is locked while the note is being sent", () => {
    render(<Harness disabled />);

    expect(field()).toBeDisabled();
  });
});
