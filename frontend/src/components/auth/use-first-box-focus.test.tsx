import { render, screen } from "@testing-library/react";
import { useFirstBoxFocus } from "./use-first-box-focus";

function Boxes({ ready }: { ready: boolean }) {
  const ref = useFirstBoxFocus(ready);
  return (
    <div ref={ref}>
      <input aria-label="first" disabled={!ready} />
      <input aria-label="second" />
    </div>
  );
}

describe("useFirstBoxFocus", () => {
  it("leaves the cursor alone while the boxes are not ready", () => {
    render(<Boxes ready={false} />);

    expect(screen.getByLabelText("first")).not.toHaveFocus();
  });

  it("focuses the first box once they are ready, and again each time they become ready", () => {
    const { rerender } = render(<Boxes ready />);
    expect(screen.getByLabelText("first")).toHaveFocus();

    screen.getByLabelText("second").focus();
    rerender(<Boxes ready={false} />);
    rerender(<Boxes ready />);

    expect(screen.getByLabelText("first")).toHaveFocus();
  });
});
