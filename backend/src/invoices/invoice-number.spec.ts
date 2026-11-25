import type { Prisma } from '@prisma/client';
import {
  formatDocumentNumber,
  documentMonth,
  nextDocumentNumber,
} from './invoice-number.js';

describe('documentMonth', () => {
  it('is the Jakarta month of the moment, as YYYYMM', () => {
    expect(documentMonth(new Date('2026-09-18T03:00:00Z'))).toBe('202609');
  });

  // 30 Nov 2026 20:00 UTC is already 1 Dec in Jakarta (UTC+7).
  it('counts a move after midnight in Jakarta in the next month', () => {
    expect(documentMonth(new Date('2026-11-30T20:00:00Z'))).toBe('202612');
  });
});

describe('formatDocumentNumber', () => {
  it.each([
    ['invoice', 1, 'TOF-INV-202609-001'],
    ['invoice', 42, 'TOF-INV-202609-042'],
    ['receipt', 999, 'TOF-RCP-202609-999'],
    // Never cut: a thousandth document in a month keeps every digit.
    ['receipt', 1000, 'TOF-RCP-202609-1000'],
  ] as const)('writes %s number %i as %s', (kind, n, expected) => {
    expect(formatDocumentNumber(kind, '202609', n)).toBe(expected);
  });
});

describe('nextDocumentNumber', () => {
  function client(lastNumber: number) {
    return { $queryRaw: vi.fn().mockResolvedValue([{ last_number: lastNumber }]) };
  }

  it.each([
    ['invoice', 'TOF-INV-202609-007'],
    ['receipt', 'TOF-RCP-202609-007'],
  ] as const)("takes the month's next %s number from its own counter, in one statement", async (kind, number) => {
    const tx = client(7);

    await expect(nextDocumentNumber(tx, kind, new Date('2026-09-18T03:00:00Z'))).resolves.toBe(number);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    const query = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toMatch(/INSERT INTO document_number_counters/);
    expect(query.sql).toMatch(/ON CONFLICT \(kind, month\) DO UPDATE/);
    expect(query.sql).toMatch(/RETURNING last_number/);
    expect(query.values).toEqual([kind, '202609']);
  });

  // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): no number is made up.
  it('fails when the counter hands back nothing', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };

    await expect(nextDocumentNumber(tx, 'invoice', new Date('2026-09-18T03:00:00Z'))).rejects.toThrow(
      'Document number counter returned no row',
    );
  });
});
