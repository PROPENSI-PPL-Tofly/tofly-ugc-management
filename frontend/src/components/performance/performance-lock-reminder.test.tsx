import { render, screen } from "@testing-library/react";
import { PERFORMANCE_LOCK_REMINDER } from "@/lib/link-performance";
import { PerformanceLockReminder } from "./performance-lock-reminder";

describe("PerformanceLockReminder", () => {
  it("is drawn as an amber warning, so it stands out from the rows around it", () => {
    render(<PerformanceLockReminder />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(PERFORMANCE_LOCK_REMINDER);
    expect(note).toHaveClass("bg-amber-wash", "text-amber-ink");
    expect(note).not.toHaveClass("bg-paper");
  });

  it("takes the spacing its place asks for", () => {
    render(<PerformanceLockReminder className="mx-5 mt-3" />);

    expect(screen.getByRole("note")).toHaveClass("mx-5", "mt-3");
  });
});
