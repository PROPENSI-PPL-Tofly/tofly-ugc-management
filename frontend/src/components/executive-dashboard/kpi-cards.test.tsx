import { render, screen, within } from "@testing-library/react";
import contract from "@/test/fixtures/executive-kpis.contract.json";
import { FAILED_KPIS, toExecutiveKpis } from "@/lib/executive-kpis";
import { KpiCards, KpiCardsSkeleton } from "./kpi-cards";

const LABELS = [
  "Total Spending",
  "Belum Dibayar",
  "Total Views",
  "Biaya per 1.000 Views",
  "On-time Rate",
  "Engagement Rate",
];

const RETRY = "/admin/dashboard";

function cards() {
  return screen.getAllByRole("listitem");
}

describe("KpiCards", () => {
  it("draws the six KPI cards in the design's order from the contract fixture", () => {
    render(
      <KpiCards
        kpis={toExecutiveKpis(contract)}
        months={6}
        retryHref={RETRY}
      />,
    );

    expect(cards()).toHaveLength(6);
    cards().forEach((card, index) =>
      expect(card).toHaveTextContent(LABELS[index]),
    );
    expect(screen.getByText("Rp41,3 jt")).toBeInTheDocument();
    expect(screen.getByText("5,12%")).toBeInTheDocument();
  });

  it("lays the cards out three across, two across below 900px, closer together on a phone", () => {
    render(
      <KpiCards
        kpis={toExecutiveKpis(contract)}
        months={6}
        retryHref={RETRY}
      />,
    );

    expect(screen.getByRole("list")).toHaveClass(
      "grid",
      "grid-cols-3",
      "gap-3.5",
      "max-[900px]:grid-cols-2",
      "max-[560px]:gap-2.5",
      "mb-4",
    );
  });

  it("puts the waiting-links note on Total Views only", () => {
    render(
      <KpiCards
        kpis={toExecutiveKpis(contract)}
        months={6}
        retryHref={RETRY}
      />,
    );

    expect(
      within(cards()[2]).getByText("3 link belum ada data"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/link belum ada data/)).toHaveLength(1);
  });

  it("hands the chosen range's length to every comparison", () => {
    render(
      <KpiCards
        kpis={toExecutiveKpis(contract)}
        months={12}
        retryHref={RETRY}
      />,
    );

    expect(
      screen.getAllByText("vs 12 bulan sebelumnya").length,
    ).toBeGreaterThan(0);
  });

  it("keeps the other five cards when one value fails", () => {
    const raw = structuredClone(contract) as Record<
      string,
      Record<string, unknown>
    >;
    raw.current.onTimeRate = "86,4";

    render(
      <KpiCards kpis={toExecutiveKpis(raw)} months={6} retryHref={RETRY} />,
    );

    expect(screen.getAllByText("Gagal dimuat.")).toHaveLength(1);
    expect(within(cards()[4]).getByText("Gagal dimuat.")).toBeInTheDocument();
    expect(screen.getByText("Rp41,3 jt")).toBeInTheDocument();
  });

  it("fails every card, each with its own retry, when the whole block failed", () => {
    render(<KpiCards kpis={FAILED_KPIS} months={6} retryHref={RETRY} />);

    expect(screen.getAllByText("Gagal dimuat.")).toHaveLength(6);
    expect(screen.getAllByRole("link", { name: "Coba lagi" })).toHaveLength(6);
  });
});

describe("KpiCardsSkeleton", () => {
  it("keeps the six labels and puts a shimmering bar where each figure will be", () => {
    const { container } = render(<KpiCardsSkeleton />);

    expect(cards().map((card) => card.textContent)).toEqual(LABELS);
    const bars = container.querySelectorAll("[data-skeleton]");
    expect(bars).toHaveLength(6);
    for (const bar of bars) {
      expect(bar).toHaveClass(
        "block",
        "h-6",
        "w-1/2",
        "mt-1.5",
        "animate-shimmer",
      );
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("holds the bars still for anyone who asks for less motion", () => {
    const { container } = render(<KpiCardsSkeleton />);

    for (const bar of container.querySelectorAll("[data-skeleton]")) {
      expect(bar).toHaveClass("motion-reduce:animate-none");
    }
  });

  it("tells assistive technology the cards are loading, with no figures or zeros", () => {
    const { container } = render(<KpiCardsSkeleton />);

    expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "true");
    expect(container).not.toHaveTextContent(/Rp|—|%|bulan sebelumnya|Gagal/);
  });

  it("keeps the same grid as the cards, so nothing jumps when they arrive", () => {
    render(<KpiCardsSkeleton />);

    expect(screen.getByRole("list")).toHaveClass(
      "grid-cols-3",
      "max-[900px]:grid-cols-2",
    );
  });
});
