import { fireEvent, render, screen } from "@testing-library/react";
import { CreatorContentTabBar } from "./creator-content-tab-bar";

const CONTRACT_ID = "3f2b8c1e-5d4a-4e7b-9c1d-2a6f8b0e4d11";

const { replaceQuery, latestQuery } = vi.hoisted(() => ({
  replaceQuery: vi.fn(),
  latestQuery: vi.fn(() => `?contract=3f2b8c1e-5d4a-4e7b-9c1d-2a6f8b0e4d11&tab=all&page=3`),
}));

vi.mock("@/lib/url-query", () => ({
  useUrlQuery: () => ({ replaceQuery }),
  latestQuery: () => latestQuery(),
}));

describe("CreatorContentTabBar", () => {
  it("shows all four tabs with their counts", () => {
    render(
      <CreatorContentTabBar active="all" counts={{ all: 11, action: 1, waiting: 9, done: 1 }} />,
    );

    expect(screen.getByRole("tab", { name: /Semua/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Perlu Approval/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Menunggu Kreator/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Selesai/ })).toBeInTheDocument();
  });

  it("changes the tab and resets the page on a click", () => {
    render(
      <CreatorContentTabBar active="all" counts={{ all: 11, action: 1, waiting: 9, done: 1 }} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Selesai/ }));

    expect(replaceQuery).toHaveBeenCalledTimes(1);
    const raw = replaceQuery.mock.calls[0][0] as string;
    const sent = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
    expect(sent.get("tab")).toBe("done");
    expect(sent.get("page")).toBeNull();
    expect(sent.get("contract")).toBe(CONTRACT_ID);
  });
});
