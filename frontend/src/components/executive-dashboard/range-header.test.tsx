import { render, screen, within } from "@testing-library/react";
import { RangeHeader, type RangeOption } from "./range-header";

const OPTIONS: readonly RangeOption[] = [
  { months: 3, href: "/admin/dashboard?range=3" },
  { months: 6, href: "/admin/dashboard" },
  { months: 12, href: "/admin/dashboard?range=12&sort=name&order=asc" },
];

const PERIOD = { from: "Jun 2026", to: "Nov 2026" };

function links() {
  return within(screen.getByRole("group", { name: "Rentang" })).queryAllByRole(
    "link",
  );
}

describe("RangeHeader", () => {
  it("offers 3, 6 and 12 months as one group named Rentang, as the design labels them", () => {
    render(<RangeHeader period={PERIOD} options={OPTIONS} active={6} />);

    expect(links().map((link) => link.textContent)).toEqual([
      "3 Bulan",
      "6 Bulan",
      "12 Bulan",
    ]);
  });

  it("leads each choice to the address its caller built, so the URL stays the only state", () => {
    render(<RangeHeader period={PERIOD} options={OPTIONS} active={6} />);

    expect(links().map((link) => link.getAttribute("href"))).toEqual(
      OPTIONS.map((option) => option.href),
    );
  });

  it.each([3, 6, 12])(
    "marks only the %d-month range as the current page",
    (active) => {
      render(<RangeHeader period={PERIOD} options={OPTIONS} active={active} />);

      const current = links().filter(
        (link) => link.getAttribute("aria-current") === "page",
      );
      expect(current.map((link) => link.textContent)).toEqual([
        `${active} Bulan`,
      ]);
    },
  );

  it("fills the chosen range in brand blue and leaves the others plain", () => {
    render(<RangeHeader period={PERIOD} options={OPTIONS} active={12} />);

    expect(screen.getByRole("link", { name: "12 Bulan" })).toHaveClass(
      "bg-accent",
      "text-accent-ink",
    );
    expect(screen.getByRole("link", { name: "3 Bulan" })).toHaveClass(
      "text-ink-2",
    );
    expect(screen.getByRole("link", { name: "3 Bulan" })).not.toHaveClass(
      "bg-accent",
    );
  });

  it("draws the group as the design's pill", () => {
    render(<RangeHeader period={PERIOD} options={OPTIONS} active={6} />);

    expect(screen.getByRole("group", { name: "Rentang" })).toHaveClass(
      "inline-flex",
      "rounded-full",
      "border",
      "border-rule",
      "bg-surface",
      "p-0.5",
    );
  });

  it("widens each choice's press on a phone without changing how it looks", () => {
    render(<RangeHeader period={PERIOD} options={OPTIONS} active={6} />);

    for (const link of links()) {
      // An invisible ::before reaches 10px above and below the 27px pill: about 47px to press.
      expect(link).toHaveClass(
        "relative",
        "inline-block",
        "max-sm:before:absolute",
        "max-sm:before:-inset-y-2.5",
      );
      // No min-height: the pill keeps the design's size.
      expect(link.className).not.toMatch(/min-h-/);
    }
  });

  it("names the range shown, both ends written the same way", () => {
    render(<RangeHeader period={PERIOD} options={OPTIONS} active={6} />);

    expect(screen.getByText("Jun 2026 – Nov 2026")).toHaveClass(
      "text-xs",
      "text-muted",
    );
  });

  it("still offers the ranges when the period is unknown, such as after a failed load", () => {
    const { container } = render(
      <RangeHeader period={null} options={OPTIONS} active={6} />,
    );

    expect(links()).toHaveLength(3);
    expect(container).not.toHaveTextContent("–");
  });

  it("writes the period as text, never as markup (OWASP A05)", () => {
    const { container } = render(
      <RangeHeader
        period={{ from: '<img src=x onerror="alert(1)">', to: "Nov 2026" }}
        options={OPTIONS}
        active={6}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent(
      '<img src=x onerror="alert(1)"> – Nov 2026',
    );
  });

  it.each([
    "javascript:alert(1)",
    "//evil.example/admin",
    "https://evil.example",
    "/\\evil.example",
  ])(
    "never draws a choice that would leave the site, such as %s (OWASP A05)",
    (href) => {
      render(
        <RangeHeader
          period={PERIOD}
          options={[{ months: 3, href }, OPTIONS[1]]}
          active={6}
        />,
      );

      expect(links().map((link) => link.getAttribute("href"))).toEqual([
        OPTIONS[1].href,
      ]);
    },
  );
});
