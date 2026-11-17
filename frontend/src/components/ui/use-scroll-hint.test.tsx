import { act, fireEvent, render, screen } from "@testing-library/react";
import { useScrollHint } from "./use-scroll-hint";

// jsdom lays nothing out, so each test gives the strip the widths a phone measured.
function measure(
  el: HTMLElement,
  { client, scroll, left = 0 }: { client: number; scroll: number; left?: number },
) {
  let scrollLeft = left;
  Object.defineProperty(el, "clientWidth", { configurable: true, value: client });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });
}

function box(el: Element, left: number, right: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    right,
    width: right - left,
    top: 0,
    bottom: 40,
    height: 40,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
}

function Strip({ current = "a" }: Readonly<{ current?: string }>) {
  const ref = useScrollHint<HTMLUListElement>(current);
  return (
    <ul ref={ref} data-testid="strip">
      {["a", "b", "c", "d"].map((key) => (
        <li key={key} aria-current={key === current ? "true" : undefined}>
          {key}
        </li>
      ))}
    </ul>
  );
}

describe("useScrollHint", () => {
  it("marks nothing while every item fits", () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    measure(strip, { client: 300, scroll: 300 });

    fireEvent.scroll(strip);

    expect(strip).not.toHaveAttribute("data-more");
  });

  it("marks the end while more items sit off to the right", () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    measure(strip, { client: 288, scroll: 381 });

    fireEvent.scroll(strip);

    expect(strip).toHaveAttribute("data-more", "end");
  });

  it("marks both edges once scrolled part of the way", () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    measure(strip, { client: 288, scroll: 381, left: 40 });

    fireEvent.scroll(strip);

    expect(strip).toHaveAttribute("data-more", "both");
  });

  it("marks only the start at the end of the row", () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    measure(strip, { client: 288, scroll: 381, left: 93 });

    fireEvent.scroll(strip);

    expect(strip).toHaveAttribute("data-more", "start");
  });

  it("updates when the strip is resized, not only when it is scrolled", () => {
    render(<Strip />);
    const strip = screen.getByTestId("strip");
    measure(strip, { client: 288, scroll: 381 });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(strip).toHaveAttribute("data-more", "end");
  });

  it("scrolls the current item fully into the strip, without moving the page", () => {
    const { rerender } = render(<Strip current="a" />);
    const strip = screen.getByTestId("strip");
    measure(strip, { client: 288, scroll: 381 });
    box(strip, 16, 304);
    box(screen.getByText("d"), 260, 376);

    rerender(<Strip current="d" />);

    // 376 - 304: just far enough for the item's right edge to meet the strip's.
    expect(strip.scrollLeft).toBe(72);
  });

  it("brings back a current item hidden off the start", () => {
    const { rerender } = render(<Strip current="d" />);
    const strip = screen.getByTestId("strip");
    measure(strip, { client: 288, scroll: 381, left: 93 });
    box(strip, 16, 304);
    box(screen.getByText("a"), -60, 40);

    rerender(<Strip current="a" />);

    expect(strip.scrollLeft).toBe(17);
  });
});
