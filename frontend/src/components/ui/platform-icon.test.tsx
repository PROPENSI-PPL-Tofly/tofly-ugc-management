import { render, screen } from "@testing-library/react";
import { ALL_PLATFORMS, PlatformIcon, PlatformIcons } from "./platform-icon";

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
    render(<PlatformIcons platforms={["instagram", "tiktok"]} />);

    expect(screen.getByRole("img", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "TikTok" })).toBeInTheDocument();
  });

  it("shows a platform once however often the list names it", () => {
    render(<PlatformIcons platforms={["instagram", "instagram"]} />);

    expect(screen.getAllByRole("img", { name: "Instagram" })).toHaveLength(1);
  });

  it("shows nothing at all while no link has been sent", () => {
    const { container } = render(<PlatformIcons platforms={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps every platform it draws available to the tables", () => {
    expect(ALL_PLATFORMS).toEqual(["instagram", "tiktok"]);
  });
});
