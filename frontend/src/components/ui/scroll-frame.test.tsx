import { fireEvent, render, screen } from "@testing-library/react";
import { ScrollFrame } from "./scroll-frame";
import { SCROLL_HINT } from "./use-scroll-hint";

// Measured at 1024px, where the tables show as tables: Creator Database scrolled 727 of 972px,
// Content Plan 727 of 871px and Rate & Invoicing 727 of 965px sideways, with nothing to say the
// Status and Aksi columns sat past the edge. The frame fades the edge that hides more.
describe("ScrollFrame", () => {
  function frame() {
    render(
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
    return screen.getByRole("table", { name: "Daftar" }).parentElement as HTMLElement;
  }

  it("scrolls its table sideways and fades the edge that hides more", () => {
    const el = frame();
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 727 });
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 972 });

    fireEvent.scroll(el);

    expect(el).toHaveClass("overflow-x-auto", ...SCROLL_HINT.split(" "));
    expect(el).toHaveAttribute("data-more", "end");
  });

  it("fades nothing while the table fits", () => {
    const el = frame();
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 983 });
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 983 });

    fireEvent.scroll(el);

    expect(el).not.toHaveAttribute("data-more");
  });
});
