import { render, screen } from "@testing-library/react";
import contract from "@/test/fixtures/executive-kpis.contract.json";
import { KpiSection } from "./kpi-section";

const RETRY = "/admin/dashboard?range=12";

/** A stand-in for the dashboard loader's refusal: an error that carries the backend's status. */
class LoadRefused extends Error {
  constructor(readonly status: number) {
    super(`Loading the executive dashboard failed with HTTP ${status}`);
  }
}

async function renderSection(kpis: Promise<unknown>, months = 6) {
  return render(await KpiSection({ kpis, months, retryHref: RETRY }));
}

describe("KpiSection", () => {
  it("draws the six cards from the KPI block the page's single request returned", async () => {
    const load = vi.fn(() => Promise.resolve(contract));

    await renderSection(load());

    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Rp41,3 jt")).toBeInTheDocument();
    expect(screen.queryByText("Gagal dimuat.")).toBeNull();
  });

  it("hands the range's length and the retry address to the cards", async () => {
    const oneFailed = {
      ...contract,
      current: { ...contract.current, onTimeRate: "86,4" },
    };

    await renderSection(Promise.resolve(oneFailed), 12);

    expect(
      screen.getAllByText("vs 12 bulan sebelumnya").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Coba lagi" })).toHaveAttribute(
      "href",
      RETRY,
    );
  });

  it.each([401, 403])(
    "shows each card's error and never a figure when the backend refuses the session with %d (OWASP A01)",
    async (status) => {
      const { container } = await renderSection(
        Promise.reject(new LoadRefused(status)),
      );

      expect(screen.getAllByText("Gagal dimuat.")).toHaveLength(6);
      expect(container).not.toHaveTextContent(/Rp|%|—|bulan sebelumnya/);
      expect(container).not.toHaveTextContent(String(status));
    },
  );

  it("never shows why the load failed, so no backend detail reaches the page (OWASP A02)", async () => {
    const detail = 'relation "invoices" does not exist (db-01.internal:5432)';

    const { container } = await renderSection(
      Promise.reject(new Error(detail)),
    );

    expect(container).not.toHaveTextContent(
      /relation|invoices|db-01|5432|HTTP/,
    );
    expect(screen.getAllByText("Gagal dimuat.")).toHaveLength(6);
  });

  it.each([
    ["no KPI block at all", undefined],
    ["a block of the wrong shape", { current: "41250000" }],
  ])(
    "treats %s as six failed cards, not zeros (OWASP A10)",
    async (_case, raw) => {
      const { container } = await renderSection(Promise.resolve(raw));

      expect(screen.getAllByText("Gagal dimuat.")).toHaveLength(6);
      expect(container).not.toHaveTextContent("Rp0");
    },
  );

  it("waits for the load it was given before drawing, so a keyed Suspense can show the skeleton meanwhile", async () => {
    let settle: (value: unknown) => void = () => undefined;
    const pending = new Promise<unknown>((resolve) => {
      settle = resolve;
    });

    const section = KpiSection({ kpis: pending, months: 6, retryHref: RETRY });
    expect(section).toBeInstanceOf(Promise);

    settle(contract);
    render(await section);
    expect(screen.getByText("Rp41,3 jt")).toBeInTheDocument();
  });
});
