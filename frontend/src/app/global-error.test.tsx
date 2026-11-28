import { fireEvent, render, screen } from "@testing-library/react";
import * as Sentry from "@sentry/nextjs";
import GlobalError from "./global-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/error", () => ({
  default: () => <div>Halaman bermasalah</div>,
}));

describe("GlobalError", () => {
  afterEach(() => vi.clearAllMocks());

  it("reports the error that replaced the root layout to Sentry", () => {
    const error = new Error("render exploded");

    render(<GlobalError error={error} retry={vi.fn()} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(screen.getByText("Halaman bermasalah")).toBeInTheDocument();
  });

  it("offers a way to try the failed render again", () => {
    const retry = vi.fn();

    render(<GlobalError error={new Error("render exploded")} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
