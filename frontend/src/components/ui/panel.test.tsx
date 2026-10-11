import { render, screen } from "@testing-library/react";
import { Panel, PanelHead } from "./panel";

describe("Panel", () => {
  it("wraps its content in a section", () => {
    render(
      <Panel>
        <p>isi</p>
      </Panel>,
    );
    expect(screen.getByText("isi").closest("section")).not.toBeNull();
  });

  it("clips its content to its rounded corners unless told otherwise", () => {
    render(
      <Panel>
        <p>isi</p>
      </Panel>,
    );
    expect(screen.getByText("isi").closest("section")).toHaveClass("overflow-hidden");
  });

  // A filter's popup hangs below its trigger; clipped, it was cut off wherever the panel ended.
  it("lets its content hang past its edge when it holds a popup", () => {
    render(
      <Panel clip={false}>
        <p>isi</p>
      </Panel>,
    );
    const section = screen.getByText("isi").closest("section");

    expect(section).not.toHaveClass("overflow-hidden");
    expect(section).toHaveClass("border", "border-rule", "bg-surface");
  });
});

describe("PanelHead", () => {
  it("renders the title as a heading with an optional hint", () => {
    render(<PanelHead title="Semua creator" hint="Kontrak dan progres" />);
    expect(screen.getByRole("heading", { name: "Semua creator" })).toBeInTheDocument();
    expect(screen.getByText("Kontrak dan progres")).toBeInTheDocument();
  });

  it("renders without a hint", () => {
    render(<PanelHead title="Semua creator" />);
    expect(screen.getByRole("heading", { name: "Semua creator" })).toBeInTheDocument();
    expect(screen.queryByText("Kontrak dan progres")).toBeNull();
  });
});
