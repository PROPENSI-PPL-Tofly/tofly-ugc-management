import { render } from "@testing-library/react";
import { PRODUCTIVITY_BANDS, PRODUCTIVITY_TIP } from "@/lib/creator-detail";
import { ProductivityTip } from "./productivity-tip";

describe("ProductivityTip", () => {
  it("puts each productivity band on a line of its own, its name first", () => {
    const { container } = render(<ProductivityTip />);

    expect(PRODUCTIVITY_BANDS.map(({ label }) => label)).toEqual([
      "Baik",
      "Perlu Perhatian",
      "Berisiko",
      "Belum Dinilai",
      "Belum Ada Data",
    ]);
    expect(container.querySelectorAll("br")).toHaveLength(PRODUCTIVITY_BANDS.length - 1);
    expect(container.textContent).toContain("Baik: Tepat waktu ≥ 80% dan revisi ≤ 1×.");
    expect(container.textContent).toContain("Berisiko: Tepat waktu < 40% atau revisi > 2×.");
  });

  it("reads as the same one-line explanation a screen reader hears", () => {
    const { container } = render(<ProductivityTip />);

    expect(container.textContent).toBe(PRODUCTIVITY_TIP);
  });
});
