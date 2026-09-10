import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HealthPage from "./page";

const mockFetch = (impl: () => Promise<Response>) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(impl);

describe("Health page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the checking state before the request settles", () => {
    mockFetch(() => new Promise(() => {}));

    render(<HealthPage />);

    expect(screen.getByTestId("status")).toHaveTextContent("checking");
  });

  it("reports ok and echoes the backend payload", async () => {
    const fetchSpy = mockFetch(async () => new Response('{"db":"ok"}', { status: 200 }));

    render(<HealthPage />);

    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(screen.getByTestId("detail")).toHaveTextContent('{"db":"ok"}');
    // Same-origin: the browser must never be given the backend's URL.
    expect(fetchSpy).toHaveBeenCalledWith("/api/health");
  });

  it("reports error when the proxy returns 502", async () => {
    mockFetch(async () => new Response('{"error":"Bad gateway"}', { status: 502 }));

    render(<HealthPage />);

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(screen.getByTestId("detail")).toHaveTextContent("HTTP 502");
  });

  it("reports error when the request itself fails", async () => {
    mockFetch(async () => {
      throw new Error("NetworkError");
    });

    render(<HealthPage />);

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(screen.getByTestId("detail")).toHaveTextContent("NetworkError");
  });
});
