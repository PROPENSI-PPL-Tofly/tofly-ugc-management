import { act, render, screen } from "@testing-library/react";
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

  it("describes a non-Error failure", async () => {
    mockFetch(() => Promise.reject("offline"));

    render(<HealthPage />);

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(screen.getByTestId("detail")).toHaveTextContent("offline");
  });

  // Leaving the page mid-request must not write the late answer into an unmounted component.
  it.each([
    ["succeeds", (settle: Settle) => settle.resolve(new Response("{}", { status: 200 }))],
    ["fails", (settle: Settle) => settle.reject(new Error("late"))],
  ])("ignores a request that %s after the page is left", async (_, finish) => {
    const settle = deferred();
    mockFetch(() => settle.promise);

    const { unmount } = render(<HealthPage />);
    unmount();
    await act(async () => finish(settle));

    expect(screen.queryByTestId("status")).not.toBeInTheDocument();
  });
});

interface Settle {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
}

function deferred(): Settle {
  let resolve!: Settle["resolve"];
  let reject!: Settle["reject"];
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
