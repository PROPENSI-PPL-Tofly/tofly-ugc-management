import { render, screen } from "@testing-library/react";
import { Panel, PanelBand, PanelHead } from "./panel";

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

// The approved list screens title each list in a tinted band: an icon, the name, and how many
// it holds, tinted by whose screen it is (the creator's accent, the admin's ink).
describe("PanelBand", () => {
  function band() {
    return screen.getByRole("heading", { name: "Semua creator" }).closest("[data-tone]") as HTMLElement;
  }

  it("names the list in a heading, with its size beside it read as a count", () => {
    render(<PanelBand title="Semua creator" tone="ink" icon="people" count={12} noun="creator" />);

    expect(screen.getByRole("heading", { level: 2, name: "Semua creator" })).toBeInTheDocument();
    expect(band().querySelector("[data-count]")).toHaveTextContent("12 creator");
  });

  it("draws a bare count when no noun is given", () => {
    render(<PanelBand title="Semua creator" tone="ink" icon="people" count={12} />);

    expect(band().querySelector("[data-count]")?.textContent).toBe("12");
  });

  it("draws no count when the list's size is not known", () => {
    render(<PanelBand title="Semua creator" tone="ink" icon="people" />);

    expect(band().querySelector("[data-count]")).toBeNull();
  });

  it.each([
    ["accent", "bg-accent-wash", "bg-accent"],
    ["ink", "bg-surface-2", "bg-ink"],
    ["quiet", "bg-surface-2", "bg-ink-2"],
  ] as const)("tints a %s band and its count", (tone, bandBg, countBg) => {
    render(<PanelBand title="Semua creator" tone={tone} icon="people" count={3} noun="creator" />);

    expect(band()).toHaveAttribute("data-tone", tone);
    expect(band()).toHaveClass(bandBg, "border-b-[1.5px]");
    expect(band().querySelector("[data-count]")).toHaveClass(countBg);
  });

  it("carries a decorative icon", () => {
    render(<PanelBand title="Semua creator" tone="ink" icon="people" />);

    expect(band().querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  // On a phone the tabs are folded into the filters, so the band says which one is open.
  it("shows the aside on a phone only, and the action and hint wherever", () => {
    render(
      <PanelBand
        title="Semua creator"
        tone="ink"
        icon="people"
        aside="Menunggu Kreator"
        action={<button type="button">Tambah</button>}
        hint="Kontrak dan progres"
      />,
    );

    expect(screen.getByText("Menunggu Kreator")).toHaveClass("sm:hidden");
    expect(screen.getByRole("button", { name: "Tambah" })).toBeInTheDocument();
    expect(screen.getByText("Kontrak dan progres")).toBeInTheDocument();
  });
});
