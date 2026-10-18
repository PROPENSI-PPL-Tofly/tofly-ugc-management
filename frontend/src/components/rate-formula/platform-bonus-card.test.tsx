import { fireEvent, render, screen } from "@testing-library/react";
import { EMPTY_TIER, type PlatformDraft } from "@/lib/rate-formula";
import { PlatformBonusCard } from "./platform-bonus-card";

const TWO_TIERS: PlatformDraft = {
  metric: "views",
  tiers: [
    { threshold: 10000, bonus: 150000 },
    { threshold: 40000, bonus: 400000 },
  ],
};

function setup(overrides: { value?: PlatformDraft; error?: string } = {}) {
  const onChange = vi.fn();
  render(
    <PlatformBonusCard
      platform="instagram"
      value={overrides.value ?? TWO_TIERS}
      error={overrides.error}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("PlatformBonusCard", () => {
  it("names the platform and shows its tiers with a count out of five", () => {
    setup();

    expect(screen.getByRole("group", { name: "Bonus performa Instagram" })).toBeInTheDocument();
    expect(screen.getByLabelText("Instagram tier 1 minimum Views")).toHaveValue("10000");
    expect(screen.getByLabelText("Instagram tier 1 bonus (Rp)")).toHaveValue("150000");
    expect(screen.getByLabelText("Instagram tier 2 minimum Views")).toHaveValue("40000");
    expect(screen.getByText("2/5 tier")).toBeInTheDocument();
  });

  it("lets the platform name and metric wrap, and the tier inputs shrink, on a narrow screen", () => {
    setup();

    const group = screen.getByRole("group", { name: "Bonus performa Instagram" });
    expect(screen.getByRole("heading", { name: "Instagram" }).parentElement).toHaveClass("flex-wrap");
    expect(
      Array.from(group.querySelectorAll("div")).some((div) =>
        div.className.includes("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"),
      ),
    ).toBe(true);
    expect(screen.getByLabelText("Instagram tier 1 minimum Views")).toHaveClass("min-w-0");
  });

  it("shows where focus is on the metric picker, which draws no outline of its own", () => {
    setup();

    expect(screen.getByLabelText(/metrik/i).closest("label")).toHaveClass(
      "focus-within:outline-2",
      "focus-within:outline-focus",
    );
  });

  it("names the minimum column after the chosen metric", () => {
    setup({ value: { metric: "shares", tiers: [EMPTY_TIER] } });

    expect(screen.getByText("Minimum Shares")).toBeInTheDocument();
    expect(screen.getByLabelText("Instagram tier 1 minimum Shares")).toHaveValue("");
  });

  it("offers views, likes, comments and shares as the metric", () => {
    setup();

    const options = screen.getAllByRole("option").map((option) => option.textContent);

    expect(options).toEqual(["Views", "Likes", "Comments", "Shares"]);
  });

  it("restarts the tiers on one empty row when the metric changes", () => {
    const onChange = setup();

    fireEvent.change(screen.getByLabelText(/metrik/i), { target: { value: "shares" } });

    expect(onChange).toHaveBeenCalledWith({ metric: "shares", tiers: [EMPTY_TIER] });
  });

  it("reports a typed minimum that is not a whole number as not a number, keeping what was typed", () => {
    const onChange = setup();
    const minimum = screen.getByLabelText("Instagram tier 1 minimum Views");

    fireEvent.change(minimum, { target: { value: "2.500x" } });

    expect(minimum).toHaveValue("2.500x");
    expect(onChange).toHaveBeenCalledWith({
      metric: "views",
      tiers: [{ threshold: Number.NaN, bonus: 150000 }, TWO_TIERS.tiers[1]],
    });
  });

  it("reports a typed minimum of digits as its number", () => {
    const onChange = setup();

    fireEvent.change(screen.getByLabelText("Instagram tier 1 minimum Views"), {
      target: { value: "2500" },
    });

    expect(onChange).toHaveBeenCalledWith({
      metric: "views",
      tiers: [{ threshold: 2500, bonus: 150000 }, TWO_TIERS.tiers[1]],
    });
  });

  it("reports a typed bonus", () => {
    const onChange = setup();

    fireEvent.change(screen.getByLabelText("Instagram tier 2 bonus (Rp)"), {
      target: { value: "450000" },
    });

    expect(onChange).toHaveBeenCalledWith({
      metric: "views",
      tiers: [TWO_TIERS.tiers[0], { threshold: 40000, bonus: 450000 }],
    });
  });

  it("reports an emptied field as empty rather than 0", () => {
    const onChange = setup();

    fireEvent.change(screen.getByLabelText("Instagram tier 1 bonus (Rp)"), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith({
      metric: "views",
      tiers: [{ threshold: 10000, bonus: null }, TWO_TIERS.tiers[1]],
    });
  });

  it("adds an empty tier", () => {
    const onChange = setup();

    fireEvent.click(screen.getByRole("button", { name: "+ Tambah Tier" }));

    expect(onChange).toHaveBeenCalledWith({
      metric: "views",
      tiers: [...TWO_TIERS.tiers, EMPTY_TIER],
    });
  });

  it("stops offering more tiers at five", () => {
    const five = Array.from({ length: 5 }, (_, index) => ({
      threshold: (index + 1) * 100,
      bonus: (index + 1) * 1000,
    }));
    setup({ value: { metric: "views", tiers: five } });

    expect(screen.getByText("5/5 tier")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Tambah Tier" })).toBeDisabled();
  });

  it("removes the tier whose ✕ was pressed", () => {
    const onChange = setup();

    fireEvent.click(screen.getByRole("button", { name: "Hapus Instagram tier 1" }));

    expect(onChange).toHaveBeenCalledWith({ metric: "views", tiers: [TWO_TIERS.tiers[1]] });
  });

  it("shows the message under the rows and ties every input to it", () => {
    setup({ error: "Minimum dan bonus harus lebih dari 0." });

    const message = screen.getByText("Minimum dan bonus harus lebih dari 0.");
    const input = screen.getByLabelText("Instagram tier 1 minimum Views");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Minimum dan bonus harus lebih dari 0.");
    expect(message).toBeInTheDocument();
  });

  it("marks nothing invalid while there is no message", () => {
    setup();

    expect(screen.getByLabelText("Instagram tier 1 minimum Views")).not.toHaveAttribute(
      "aria-invalid",
    );
  });
});
