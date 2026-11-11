import { fireEvent, render, screen, within } from "@testing-library/react";
import { SingleSelect } from "./multi-select";
import { pickFilter } from "@/test/filters";

const OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "yes", label: "Overdue" },
  { value: "no", label: "Tidak overdue" },
];

function renderSelect(value = "all", onChange = vi.fn()) {
  render(<SingleSelect label="Overdue" value={value} options={OPTIONS} onChange={onChange} />);
  return onChange;
}

function trigger() {
  return screen.getByRole("button", { name: /^Overdue:/ });
}

// One choice out of a few, drawn as the very same pill and popup as the multi-selects: every filter
// in the app looks one way.
describe("SingleSelect", () => {
  it("shows the chosen option under its label, as the multi-select pill does", () => {
    renderSelect("yes");

    expect(trigger()).toHaveTextContent("Overdue: Overdue");
    expect(trigger()).toHaveClass("rounded-full");
  });

  it("opens the same popup, the first option set apart above the rest", () => {
    renderSelect();

    fireEvent.click(trigger());

    const popup = screen.getByRole("radiogroup", { name: "Overdue" });
    const choices = within(popup).getAllByRole("radio");
    expect(choices.map((choice) => choice.closest("label")?.textContent)).toEqual([
      "Semua",
      "Overdue",
      "Tidak overdue",
    ]);
    expect(choices[0]).toBeChecked();
    expect(choices[0].closest("label")).toHaveClass("border-b");
  });

  it("hands the pick over and closes", () => {
    const onChange = renderSelect();

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("radio", { name: "Tidak overdue" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("no");
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("closes on pressing the choice already held, changing nothing", () => {
    const onChange = renderSelect("all");

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("radio", { name: "Semua" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("closes on Escape, handing focus back to the pill, and on a press outside", () => {
    renderSelect();

    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(trigger()).toHaveFocus();

    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("is driven by the shared test helper the filter bars' tests use", () => {
    const onChange = renderSelect();

    pickFilter("Overdue", "Overdue");

    expect(onChange).toHaveBeenCalledWith("yes");
  });
});
