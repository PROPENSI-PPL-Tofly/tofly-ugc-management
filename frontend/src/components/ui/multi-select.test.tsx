import { fireEvent, render, screen } from "@testing-library/react";
import { MultiSelect } from "./multi-select";

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
});
