import { render, screen } from "@testing-library/react";
import type { KpiKey, KpiReading } from "@/lib/executive-kpis";
import {
  KPI_STRATEGIES,
  type KpiStrategy,
} from "@/lib/executive-kpi-strategies";
import { KpiCard } from "./kpi-card";

const RETRY = "/admin/dashboard?range=12";

function strategy(key: KpiKey): KpiStrategy {
  return KPI_STRATEGIES.find((entry) => entry.key === key) as KpiStrategy;
}

function renderCard(
  key: KpiKey,
  reading: KpiReading,
  {
    note = null,
    months = 6,
    retryHref = RETRY,
  }: { note?: string | null; months?: number; retryHref?: string } = {},
) {
  return render(
    <KpiCard
      strategy={strategy(key)}
      reading={reading}
      note={note}
      months={months}
      retryHref={retryHref}
    />,
  );
}

const ok = (current: number | null, previous: number | null): KpiReading => ({
  status: "ok",
  current,
  previous,
});

/** The comparison line: the paragraph that says what the figure is compared with. */
function trendLine(container: HTMLElement) {
  return container.querySelector("[data-trend]");
}

describe("KpiCard with a figure", () => {
  it("shows the KPI's label and its figure in the strategy's format", () => {
    renderCard("totalSpending", ok(41_240_000, 36_700_000));

    expect(screen.getByText("Total Spending")).toBeInTheDocument();
    expect(screen.getByText("Rp41,2 jt")).toHaveClass(
      "text-[26px]",
      "font-extrabold",
      "tabular-nums",
      "max-[560px]:text-[20px]",
    );
  });

  it("draws the design's card", () => {
    const { container } = renderCard("totalViews", ok(10, 10));

    expect(container.firstElementChild).toHaveClass(
      "h-full",
      "rounded-(--radius-panel)",
      "border-[1.5px]",
      "border-rule",
      "bg-surface",
      "shadow-whisper",
      "px-[18px]",
      "py-4",
    );
  });

  it("explains the figure in a tooltip named after its formula, leading with the full value", () => {
    renderCard("totalSpending", ok(41_240_000, 36_700_000));

    expect(
      screen.getByRole("button", { name: "Rumus Total Spending" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "Nilai penuh Rp41.240.000. Total invoice yang difinalisasi di rentang ini. Invoice Cancelled tidak dihitung.",
    );
  });

  it("shows no data as a dash, never 0, with no comparison and the formula alone", () => {
    const { container } = renderCard("totalSpending", ok(null, 36_700_000));

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Rp0");
    expect(trendLine(container)).toBeNull();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      /^Total invoice/,
    );
  });

  it("has no comparison when the previous range has no data", () => {
    const { container } = renderCard("onTimeRate", ok(86.4, null));

    expect(screen.getByText("86,4%")).toBeInTheDocument();
    expect(trendLine(container)).toBeNull();
  });
});

describe("KpiCard's comparison", () => {
  it("says a rise against the range of the same length before it, as the design writes it", () => {
    const { container } = renderCard("totalViews", ok(1_124, 1_000), {
      months: 6,
    });

    const line = trendLine(container);
    expect(line).toHaveClass("mt-1.5", "text-xs");
    expect(line?.textContent?.replace(/\s+/g, " ")).toMatch(
      /▲.*12,4%.*vs 6 bulan sebelumnya/,
    );
  });

  it("names the chosen range's length", () => {
    const { container } = renderCard("totalViews", ok(1_124, 1_000), {
      months: 12,
    });

    expect(trendLine(container)).toHaveTextContent("vs 12 bulan sebelumnya");
  });

  it.each([
    ["good news in green", "totalViews", ok(1_124, 1_000), "text-green-ink"],
    ["bad news in red", "onTimeRate", ok(86.4, 88.1), "text-red-ink"],
    [
      "a neutral KPI's rise in grey",
      "totalSpending",
      ok(120, 100),
      "text-ink-2",
    ],
    ["no change in grey", "unpaidAmount", ok(500, 500), "text-ink-2"],
  ] as const)("colours %s", (_case, key, reading, colour) => {
    const { container } = renderCard(key, reading);

    expect(container.querySelector("[data-trend] > span")).toHaveClass(
      "font-bold",
      colour,
    );
  });

  it.each([
    ["a rise", "totalViews", ok(1_124, 1_000), "▲"],
    ["a fall", "onTimeRate", ok(86.4, 88.1), "▼"],
    ["no change", "unpaidAmount", ok(500, 500), "■"],
  ] as const)(
    "marks %s with its own shape, not colour alone",
    (_case, key, reading, glyph) => {
      const { container } = renderCard(key, reading);

      const mark = container.querySelector("[data-trend] [aria-hidden='true']");
      expect(mark).toHaveTextContent(glyph);
    },
  );

  it.each([
    [
      "a good fall in words",
      "costPer1000Views",
      ok(900, 1_000),
      "turun",
      "lebih baik",
    ],
    [
      "a bad fall in words",
      "onTimeRate",
      ok(86.4, 88.1),
      "turun",
      "lebih buruk",
    ],
    [
      "a good rise in words",
      "totalViews",
      ok(1_124, 1_000),
      "naik",
      "lebih baik",
    ],
  ] as const)(
    "tells a screen reader %s, since the shape is hidden from it (WCAG 1.4.1)",
    (_case, key, reading, move, verdict) => {
      const { container } = renderCard(key, reading);

      const said = [...container.querySelectorAll("[data-trend] .sr-only")]
        .map((node) => node.textContent)
        .join(" ");
      expect(said).toContain(move);
      expect(said).toContain(verdict);
    },
  );

  it("gives no verdict for a neutral KPI or an unchanged one, only the move", () => {
    const { container } = renderCard("totalSpending", ok(120, 100));

    const said = container
      .querySelector("[data-trend]")
      ?.querySelectorAll(".sr-only");
    expect([...(said ?? [])].map((node) => node.textContent)).toEqual(["naik"]);
  });

  it("names the previous value instead of a percent when the previous range had 0", () => {
    const { container } = renderCard("unpaidAmount", ok(6_800_000, 0));

    const line = trendLine(container);
    expect(line).toHaveTextContent("sebelumnya Rp0");
    expect(line).not.toHaveTextContent(/Infinity|NaN|%/);
    expect(line?.querySelector("[aria-hidden='true']")).toHaveTextContent("▲");
    expect(line?.firstElementChild).toHaveClass("text-ink-2");
  });

  it("marks 0 after 0 as no change", () => {
    const { container } = renderCard("totalViews", ok(0, 0));

    expect(
      trendLine(container)?.querySelector("[aria-hidden='true']"),
    ).toHaveTextContent("■");
    expect(trendLine(container)).toHaveTextContent("tetap");
  });
});

describe("KpiCard's note", () => {
  it("shows the strategy's note under the figure", () => {
    renderCard("totalViews", ok(1_124, 1_000), {
      note: "3 link belum ada data",
    });

    expect(screen.getByText("3 link belum ada data")).toHaveClass(
      "mt-1",
      "text-xs",
      "text-muted",
    );
  });

  it("has no note line without one", () => {
    const { container } = renderCard("totalViews", ok(1_124, 1_000));

    expect(container).not.toHaveTextContent("link belum ada data");
  });
});

describe("KpiCard that failed", () => {
  it("says this card could not be loaded and offers to try again, without any figure", () => {
    const { container } = renderCard(
      "engagementRate",
      { status: "failed" },
      { note: "3 link belum ada data" },
    );

    expect(screen.getByText("Engagement Rate")).toBeInTheDocument();
    expect(screen.getByText("Gagal dimuat.")).toHaveClass("text-red-ink");
    expect(screen.getByRole("link", { name: "Coba lagi" })).toHaveAttribute(
      "href",
      RETRY,
    );
    expect(container).not.toHaveTextContent(
      /—|%|Rp|bulan sebelumnya|link belum ada data/,
    );
  });

  it("draws Coba lagi as the design's small button", () => {
    renderCard("engagementRate", { status: "failed" });

    expect(screen.getByRole("link", { name: "Coba lagi" })).toHaveClass(
      "px-2",
      "py-1",
      "border-rule",
      "inline-flex",
    );
  });

  it("has no formula tooltip, as the design's failed card has none", () => {
    renderCard("totalSpending", { status: "failed" });

    expect(screen.queryByRole("button", { name: /Rumus/ })).toBeNull();
  });

  it.each(["javascript:alert(1)", "//evil.example"])(
    "never offers a retry that would leave the site, such as %s (OWASP A05)",
    (retryHref) => {
      renderCard("totalSpending", { status: "failed" }, { retryHref });

      expect(screen.getByText("Gagal dimuat.")).toBeInTheDocument();
      expect(screen.queryByRole("link")).toBeNull();
    },
  );
});
