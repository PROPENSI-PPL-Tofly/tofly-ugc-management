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
