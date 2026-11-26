import { buildCharts, type SeriesContent, type SeriesInvoice, type SeriesLink } from './dashboard-series.js';

const TODAY = new Date('2026-11-26T03:00:00.000Z');

const invoice = (month: string, values: Partial<SeriesInvoice> = {}): SeriesInvoice => ({
  finalizedAt: `${month}-20`,
  fixedRate: 5_000_000,
  additionalContent: 2_000_000,
  performanceBonus: 1_000_000,
  total: 8_000_000,
  ...values,
});

const link = (month: string, values: Partial<SeriesLink> = {}): SeriesLink => ({
  submittedAt: `${month}-10`,
  platform: 'instagram',
  views: 100,
  dataState: 'synced',
  ...values,
});

const content = (day: string, values: Partial<SeriesContent> = {}): SeriesContent => ({
  deadline: day,
  videoSubmittedAt: null,
  isProposal: false,
  ...values,
});

describe("the executive dashboard's three monthly charts", () => {
  it('names all three with a legend and an empty table when there is no data', () => {
    const charts = buildCharts([], [], [], TODAY);

    expect(charts.map((chart) => chart.key)).toEqual(['spending', 'views', 'timeliness']);
    for (const chart of charts) {
      expect(chart.title).toBeTruthy();
      expect(chart.legend.length).toBeGreaterThan(1);
      expect(chart.months).toEqual([]);
    }
  });

  it('groups spending by the finalized month and splits it into the three components', () => {
    const charts = buildCharts(
      [invoice('2026-10'), invoice('2026-11', { fixedRate: 10_000_000, total: 13_000_000 })],
      [],
      [],
      TODAY,
    );

    expect(charts[0].months).toEqual([
      {
        month: '2026-10',
        parts: [
          { key: 'fixedRate', label: 'Fixed Rate', value: 5_000_000 },
          { key: 'additionalContent', label: 'Konten Tambahan', value: 2_000_000 },
          { key: 'performanceBonus', label: 'Bonus Performa', value: 1_000_000 },
        ],
        total: 8_000_000,
      },
      {
        month: '2026-11',
        parts: [
          { key: 'fixedRate', label: 'Fixed Rate', value: 10_000_000 },
          { key: 'additionalContent', label: 'Konten Tambahan', value: 2_000_000 },
          { key: 'performanceBonus', label: 'Bonus Performa', value: 1_000_000 },
        ],
        total: 13_000_000,
      },
    ]);
  });

  // A penalty lowers every part in proportion, so a stacked bar still adds up to its total.
  it('applies penalties and adjustments while keeping the parts equal to the total', () => {
    const [chart] = buildCharts(
      [invoice('2026-11', { total: 4_000_000 })],
      [],
      [],
      TODAY,
    );
    const month = chart.months[0];

    expect(month.parts.reduce((sum, part) => sum + part.value, 0)).toBe(month.total);
    expect(month.total).toBe(4_000_000);
    expect(month.parts[0].value).toBe(2_500_000);
  });

  it('puts a rounding remainder on the first part so the bar still totals the snapshot', () => {
    const [chart] = buildCharts(
      [
        invoice('2026-11', {
          fixedRate: 1,
          additionalContent: 1,
          performanceBonus: 1,
          total: 2,
        }),
      ],
      [],
      [],
      TODAY,
    );

    expect(chart.months[0].total).toBe(2);
    expect(chart.months[0].parts.reduce((sum, part) => sum + part.value, 0)).toBe(2);
  });

  it('keeps a snapshot with no components at zero rather than dividing by it', () => {
    const [chart] = buildCharts(
      [invoice('2026-11', { fixedRate: 0, additionalContent: 0, performanceBonus: 0, total: 0 })],
      [],
      [],
      TODAY,
    );
    expect(chart.months[0].total).toBe(0);
    expect(chart.months[0].parts.every((part) => part.value === 0)).toBe(true);
  });

  it('groups views by the hand-in month and platform', () => {
    const views = buildCharts(
      [],
      [
        link('2026-10'),
        link('2026-10', { platform: 'tiktok', views: 50 }),
        link('2026-11', { platform: 'tiktok', views: 20 }),
      ],
      [],
      TODAY,
    )[1];

    expect(views.months).toEqual([
      {
        month: '2026-10',
        parts: [
          { key: 'instagram', label: 'Instagram', value: 100 },
          { key: 'tiktok', label: 'TikTok', value: 50 },
        ],
        total: 150,
      },
      {
        month: '2026-11',
        parts: [
          { key: 'instagram', label: 'Instagram', value: 0 },
          { key: 'tiktok', label: 'TikTok', value: 20 },
        ],
        total: 20,
      },
    ]);
  });

  // AC 9: links still waiting for numbers or whose sync failed are not counted as views.
  it.each(['waiting', 'not_connected', 'not_found', 'sync_failed'] as const)(
    'leaves a %s link out of the views chart',
    (dataState) => {
      const charts = buildCharts([], [link('2026-11', { dataState })], [], TODAY);
      expect(charts[1].months).toEqual([]);
    },
  );

  it('leaves a link with no numbers or no platform out of the views chart', () => {
    const charts = buildCharts(
      [],
      [link('2026-11', { views: null }), link('2026-11', { platform: null })],
      [],
      TODAY,
    );
    expect(charts[1].months).toEqual([]);
  });

  it('buckets content due in each month as on time, late or not sent', () => {
    const timeliness = buildCharts(
      [],
      [],
      [
        content('2026-11-05', { videoSubmittedAt: '2026-11-04' }), // on time
        content('2026-11-10', { videoSubmittedAt: '2026-11-12' }), // late hand-in
        content('2026-11-15'), // overdue, not sent
        content('2026-12-15'), // due later: still open
        content('2026-11-20', { isProposal: true }), // not a commitment
      ],
      TODAY,
    )[2];

    expect(timeliness.months).toEqual([
      {
        month: '2026-11',
        parts: [
          { key: 'on_time', label: 'Tepat Waktu', value: 1 },
          { key: 'late', label: 'Terlambat', value: 2 },
          { key: 'not_sent', label: 'Belum Dikirim', value: 0 },
        ],
        total: 3,
      },
      {
        month: '2026-12',
        parts: [
          { key: 'on_time', label: 'Tepat Waktu', value: 0 },
          { key: 'late', label: 'Terlambat', value: 0 },
          { key: 'not_sent', label: 'Belum Dikirim', value: 1 },
        ],
        total: 1,
      },
    ]);
  });
});
