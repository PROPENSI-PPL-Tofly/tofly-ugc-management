import { fireEvent, render, screen } from "@testing-library/react";
import AppError from "./error";

describe("App error fallback", () => {
  it("says the page could not load without showing the error's own text", () => {
    render(<AppError error={new Error("fetch failed: ECONNREFUSED 127.0.0.1:3001")} retry={() => {}} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Halaman tidak bisa dimuat.");
    expect(screen.getByRole("alert")).toHaveTextContent("Server tidak menjawab");
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });

  it("tries the page again on Muat ulang", () => {
    const retry = vi.fn();
    render(<AppError error={new Error("x")} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Muat ulang" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
