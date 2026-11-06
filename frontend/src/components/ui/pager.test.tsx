import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { PagedList, Pager, usePageSize } from "./pager";

/**
 * A stand-in for window.matchMedia, the one browser API between the page size and the screen.
 * jsdom has none; the stub answers the query and lets a test turn the screen.
 */
function stubScreen(wide: boolean) {
  let matches = wide;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      get matches() {
        return matches;
      },
      media,
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
    })),
  );
  return {
    turn(next: boolean) {
      matches = next;
      act(() => listeners.forEach((listener) => listener({ matches: next })));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pager", () => {
  const noop = () => {};

  it("draws nothing while everything fits on one page", () => {
    const { container } = render(
      <Pager label="Halaman" noun="task" page={0} pages={1} first={1} last={2} total={2} onPrev={noop} onNext={noop} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("counts a one-row page as that row, and a longer page as a range", () => {
    const { rerender } = render(
      <Pager label="Halaman" noun="task" page={1} pages={4} first={2} last={2} total={4} onPrev={noop} onNext={noop} />,
    );
    expect(screen.getByText("2 dari 4")).toBeInTheDocument();

    rerender(<Pager label="Halaman" noun="task" page={0} pages={2} first={1} last={3} total={5} onPrev={noop} onNext={noop} />);
    expect(screen.getByText("1–3 dari 5")).toBeInTheDocument();
  });

  it("says the count again whenever the page turns, for a screen reader", () => {
    render(<Pager label="Halaman" noun="task" page={0} pages={4} first={1} last={1} total={4} onPrev={noop} onNext={noop} />);

    expect(screen.getByText("1 dari 4")).toHaveAttribute("aria-live", "polite");
  });

  it("stops at either end: no previous on the first page, no next on the last", () => {
    const { rerender } = render(
      <Pager label="Halaman" noun="task" page={0} pages={3} first={1} last={1} total={3} onPrev={noop} onNext={noop} />,
    );
    expect(screen.getByRole("button", { name: "task sebelumnya" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "task berikutnya" })).toBeEnabled();

    rerender(<Pager label="Halaman" noun="task" page={2} pages={3} first={3} last={3} total={3} onPrev={noop} onNext={noop} />);
    expect(screen.getByRole("button", { name: "task sebelumnya" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "task berikutnya" })).toBeDisabled();
  });

  it("asks for the next and the previous page and does nothing else", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Pager label="Halaman" noun="task" page={1} pages={3} first={2} last={2} total={3} onPrev={onPrev} onNext={onNext} />);

    fireEvent.click(screen.getByRole("button", { name: "task berikutnya" }));
    fireEvent.click(screen.getByRole("button", { name: "task sebelumnya" }));

    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("shows where the page is as one mark per page, the current one apart", () => {
    render(<Pager label="Halaman" noun="task" page={1} pages={3} first={2} last={2} total={3} onPrev={noop} onNext={noop} />);

    const marks = within(screen.getByRole("navigation", { name: "Halaman" })).getAllByTestId("pager-mark");
    expect(marks).toHaveLength(3);
    expect(marks.map((mark) => mark.dataset.current)).toEqual([undefined, "true", undefined]);
    expect(marks[0].closest("[aria-hidden='true']")).not.toBeNull();
  });

  // The approved design's ‹ › are 44px squares, a press a thumb can hit at every width.
  it("makes each arrow a 44px square", () => {
    render(<Pager label="Halaman" noun="task" page={1} pages={3} first={2} last={2} total={3} onPrev={noop} onNext={noop} />);

    for (const button of screen.getAllByRole("button")) expect(button).toHaveClass("size-11");
  });
});

describe("usePageSize", () => {
  function Size() {
    return <output>{usePageSize(1, 3)}</output>;
  }

  it("is the phone size on a narrow screen and the wide size on a wide one", () => {
    stubScreen(false);
    const { unmount } = render(<Size />);
    expect(screen.getByRole("status")).toHaveTextContent("1");
    unmount();

    stubScreen(true);
    render(<Size />);
    expect(screen.getByRole("status")).toHaveTextContent("3");
  });

  it("follows the screen when it turns", () => {
    const screenStub = stubScreen(false);
    render(<Size />);

    screenStub.turn(true);
    expect(screen.getByRole("status")).toHaveTextContent("3");
  });

  it("renders the phone size on the server, where there is no screen to ask", () => {
    expect(renderToString(<Size />)).toContain(">1<");
  });
});

describe("PagedList", () => {
  const ROWS = ["Satu", "Dua", "Tiga", "Empat"].map((text) => <li key={text}>{text}</li>);

  function rows() {
    return screen.getAllByRole("listitem").map((item) => item.textContent);
  }

  it("shows one row at a time on a phone and turns to the next", () => {
    stubScreen(false);
    render(<PagedList label="Halaman task overdue" noun="Task overdue" phone={1} wide={3}>{ROWS}</PagedList>);

    expect(rows()).toEqual(["Satu"]);
    expect(screen.getByText("1 dari 4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Task overdue berikutnya" }));
    expect(rows()).toEqual(["Dua"]);
    expect(screen.getByText("2 dari 4")).toBeInTheDocument();
  });

  it("turns back to the page before", () => {
    stubScreen(false);
    render(<PagedList label="Halaman task overdue" noun="Task overdue" phone={1} wide={3}>{ROWS}</PagedList>);

    fireEvent.click(screen.getByRole("button", { name: "Task overdue berikutnya" }));
    fireEvent.click(screen.getByRole("button", { name: "Task overdue berikutnya" }));
    fireEvent.click(screen.getByRole("button", { name: "Task overdue sebelumnya" }));

    expect(rows()).toEqual(["Dua"]);
    expect(screen.getByText("2 dari 4")).toBeInTheDocument();
  });

  it("shows three rows at a time on a wide screen", () => {
    stubScreen(true);
    render(<PagedList label="Halaman task overdue" noun="Task overdue" phone={1} wide={3}>{ROWS}</PagedList>);

    expect(rows()).toEqual(["Satu", "Dua", "Tiga"]);
    expect(screen.getByText("1–3 dari 4")).toBeInTheDocument();
  });

  it("draws no pager when every row fits", () => {
    stubScreen(true);
    render(<PagedList label="Halaman task overdue" noun="Task overdue" phone={1} wide={3}>{ROWS.slice(0, 2)}</PagedList>);

    expect(rows()).toEqual(["Satu", "Dua"]);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("keeps showing rows when the screen widens past the page it was on", () => {
    const screenStub = stubScreen(false);
    render(<PagedList label="Halaman task overdue" noun="Task overdue" phone={1} wide={3}>{ROWS}</PagedList>);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Task overdue berikutnya" }));
    expect(rows()).toEqual(["Empat"]);

    screenStub.turn(true);

    expect(rows()).toEqual(["Empat"]);
    expect(screen.getByText("4 dari 4")).toBeInTheDocument();
  });
});
