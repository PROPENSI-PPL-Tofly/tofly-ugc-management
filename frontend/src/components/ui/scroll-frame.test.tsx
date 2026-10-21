import { fireEvent, render, screen } from "@testing-library/react";
import { ScrollFrame } from "./scroll-frame";
import { SCROLL_HINT } from "./use-scroll-hint";

// Measured at 1024px, where the tables show as tables: Creator Database scrolled 727 of 972px,
// Content Plan 727 of 871px and Rate & Invoicing 727 of 965px sideways, with nothing to say the
// Status and Aksi columns sat past the edge. The frame marks the edge that hides more.
describe("ScrollFrame", () => {
  function frame() {
    const view = render(
      <ScrollFrame>
        <table aria-label="Daftar">
          <tbody>
            <tr>
              <td>Isi</td>
            </tr>
          </tbody>
        </table>
      </ScrollFrame>,
    );
    const el = screen.getByRole("table", { name: "Daftar" }).parentElement as HTMLElement;
    return { el, container: view.container };
  }

  /** The shade over one edge, which shows while the frame's data-more names that edge. */
  function shade(container: HTMLElement, edge: "start" | "end") {
    return container.querySelector<HTMLElement>(`[data-scroll-shade="${edge}"]`);
  }

  it("scrolls its table sideways and marks the edge that hides more", () => {
    const { el } = frame();
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 727 });
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 972 });

    fireEvent.scroll(el);

    expect(el).toHaveClass("overflow-x-auto");
    expect(el).toHaveAttribute("data-more", "end");
  });

  it("marks nothing while the table fits", () => {
    const { el } = frame();
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 983 });
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 983 });

    fireEvent.scroll(el);

    expect(el).not.toHaveAttribute("data-more");
  });

  // Measured at 1024px on Rate & Invoicing: the mask faded the table itself, and the Total
  // figures ending 3px from the edge were close to invisible. The table now stays fully drawn;
  // a narrow shade over the edge says there is more, and no figure fades.
  it("leaves the table itself unfaded, and shades only the edge that hides more", () => {
    const { el, container } = frame();

    for (const name of SCROLL_HINT.split(" ")) expect(el).not.toHaveClass(name);

    const end = shade(container, "end");
    const start = shade(container, "start");
    expect(end).toHaveAttribute("aria-hidden", "true");
    expect(start).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("peer");
    for (const [shown, edge] of [[end, "end"], [start, "start"]] as const) {
      expect(shown).toHaveClass(
        "pointer-events-none",
        "opacity-0",
        `peer-data-[more=${edge}]:opacity-100`,
        "peer-data-[more=both]:opacity-100",
      );
    }
    // The shades follow the frame as siblings, so they stay put while the table scrolls.
    expect(el.parentElement).toBe(end?.parentElement);
    expect(el.contains(end)).toBe(false);
  });
});
