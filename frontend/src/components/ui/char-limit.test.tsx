import { render, screen } from "@testing-library/react";
import { CharLimit } from "./char-limit";

describe("CharLimit", () => {
  it("counts what has been typed against the limit, quietly while there is room", () => {
    render(<CharLimit id="n" length={12} max={100} />);
    expect(screen.getByText("12/100")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the limit has been reached once the field is full", () => {
    render(<CharLimit id="n" length={100} max={100} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Maksimal 100 karakter");
  });

  it("still warns if a longer value arrives from elsewhere", () => {
    render(<CharLimit id="n" length={120} max={100} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Maksimal 100 karakter");
    expect(screen.getByText("120/100")).toBeInTheDocument();
  });

  it("carries the id a field points at through aria-describedby", () => {
    const { container } = render(<CharLimit id="brief-count" length={0} max={10} />);
    expect(container.querySelector("#brief-count")).not.toBeNull();
  });
});
