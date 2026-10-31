import { render, screen, fireEvent } from "@testing-library/react";
import { FilterChips, pickedChips, type FilterChip } from "./filter-chips";

const remove = vi.fn();

function chip(over: Partial<FilterChip> = {}): FilterChip {
  return {
    id: "creator:1",
    filterLabel: "Creator",
    valueLabel: "Adit Prakoso",
    onRemove: remove,
    ...over,
  };
}

describe("FilterChips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads every chip as the filter it came from, in the benchmark's format", () => {
    render(
      <FilterChips
        chips={[
          chip(),
          chip({ id: "t:1", filterLabel: "Tipe", valueLabel: "Evergreen" }),
        ]}
        canReset
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByText("Creator: Adit Prakoso")).toBeInTheDocument();
    expect(screen.getByText("Tipe: Evergreen")).toBeInTheDocument();
  });

  it("keeps the chips together in one row, below whatever else the bar holds", () => {
    render(
      <FilterChips
        chips={[chip(), chip({ id: "s:1", filterLabel: "Status", valueLabel: "Terjadwal" })]}
        canReset
        onReset={vi.fn()}
      />,
    );

    const row = screen.getByRole("group", { name: "Filter aktif" });
    expect(row.parentElement).toHaveClass("border-t");
  });

  it("drops one pick when its chip is pressed, without touching the others", () => {
    const second = vi.fn();
    render(
      <FilterChips
        chips={[chip(), chip({ id: "t:1", filterLabel: "Tipe", valueLabel: "Evergreen", onRemove: second })]}
        canReset
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Creator: Adit Prakoso" }));

    expect(remove).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it("offers Reset beside the chips while anything is filtered", () => {
    const onReset = vi.fn();
    render(<FilterChips chips={[chip()]} canReset onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(onReset).toHaveBeenCalledOnce();
  });

  it("holds Reset while a change is still on its way", () => {
    render(<FilterChips chips={[chip()]} canReset resetDisabled onReset={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("shows the reset alone when only single-value filters are set", () => {
    render(<FilterChips chips={[]} canReset onReset={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("says nothing at all while nothing is filtered", () => {
    const { container } = render(<FilterChips chips={[]} canReset={false} onReset={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("pickedChips", () => {
  const options = [
    { value: "a", label: "Adit Prakoso" },
    { value: "b", label: "Salsa Amelia" },
  ];

  it("names each pick after its filter and its own label", () => {
    const chips = pickedChips("Creator", ["a", "b"], options, remove);

    expect(chips.map(({ id, filterLabel, valueLabel }) => [id, filterLabel, valueLabel])).toEqual([
      ["Creator:a", "Creator", "Adit Prakoso"],
      ["Creator:b", "Creator", "Salsa Amelia"],
    ]);
  });

  it("reads a pick by its raw value when its option is gone", () => {
    const chips = pickedChips("Creator", ["id-x"], options, remove);

    expect(chips[0].valueLabel).toBe("id-x");
  });

  it("passes the removed pick back by its own value", () => {
    const chips = pickedChips("Creator", ["a", "b"], options, remove);

    chips[1].onRemove();

    expect(remove).toHaveBeenCalledWith("b");
  });

  it("collects nothing when nothing is picked", () => {
    expect(pickedChips("Creator", [], options, remove)).toEqual([]);
  });
});
