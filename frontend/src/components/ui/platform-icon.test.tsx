import { render, screen } from "@testing-library/react";
import { ALL_PLATFORMS, PlatformIcon, PlatformIcons } from "./platform-icon";
import type { ContentLink } from "@/lib/platform-links";

const link = (platform: "instagram" | "tiktok", url: string): ContentLink => ({
  platform,
  url,
  submittedAt: "2026-10-18T03:00:00.000Z",
});

describe("PlatformIcon", () => {
  it("names the mark it draws, so the icon is never the only signal", () => {
    render(<PlatformIcon platform="instagram" />);
    render(<PlatformIcon platform="tiktok" />);

    expect(screen.getByRole("img", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "TikTok" })).toBeInTheDocument();
  });

  it("keeps the drawing itself out of the way of a screen reader", () => {
    const { container } = render(<PlatformIcon platform="instagram" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PlatformIcons", () => {
  it("shows one mark per submitted platform, each named once", () => {
    render(
      <PlatformIcons
        links={[
          link("tiktok", "https://tiktok.com/@a/video/1"),
          link("instagram", "https://instagram.com/p/x"),
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "TikTok" })).toBeInTheDocument();
  });

  it("shows a platform once whatever the number of its links", () => {
    render(<PlatformIcons links={[link("instagram", "https://instagram.com/p/x")]} />);

    expect(screen.getAllByRole("img", { name: "Instagram" })).toHaveLength(1);
  });

  it("shows nothing at all while no link has been sent", () => {
    const { container } = render(<PlatformIcons links={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps every platform it draws available to the tables", () => {
    expect(ALL_PLATFORMS).toEqual(["instagram", "tiktok"]);
  });
});
