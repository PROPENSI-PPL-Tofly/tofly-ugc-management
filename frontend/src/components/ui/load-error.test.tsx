import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { LoadError } from "./load-error";

describe("LoadError", () => {
  it("raises an alert naming what failed", () => {
    render(<LoadError title="Data creator tidak bisa dimuat." retryHref="/admin/creators?q=ra" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Data creator tidak bisa dimuat.");
    expect(screen.getByRole("alert")).toHaveTextContent("Server tidak menjawab");
  });

  it("retries the same view, filters included, through a link", () => {
    render(<LoadError title="Gagal." retryHref="/admin/creators?q=ra&page=2" />);
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/admin/creators?q=ra&page=2",
    );
  });

  it("retries through a callback when there is no URL to reload", () => {
    const onRetry = vi.fn();
    render(<LoadError title="Gagal." message="Coba sebentar lagi." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Coba sebentar lagi.");
    fireEvent.click(screen.getByRole("button", { name: "Muat ulang" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers no retry control when given neither", () => {
    render(<LoadError title="Gagal." />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
