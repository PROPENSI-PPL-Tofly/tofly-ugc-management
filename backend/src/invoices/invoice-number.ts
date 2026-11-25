import { Prisma } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';

// Document numbers (PBI-31): TOF-INV-YYYYMM-NNN when the creator acknowledges the invoice, the day
// it is issued, and TOF-RCP-YYYYMM-NNN when the creator confirms the payment arrived. YYYYMM is the
// Jakarta month of that move; NNN counts that month's documents of the kind from 001 and is never
// cut, so a thousandth reads -1000.

export type DocumentKind = 'invoice' | 'receipt';

const PREFIX: Record<DocumentKind, string> = { invoice: 'TOF-INV', receipt: 'TOF-RCP' };

/** The Jakarta month a moment falls in, as YYYYMM. */
export function documentMonth(at: Date): string {
  return jakartaDay(at).slice(0, 7).replace('-', '');
}

export function formatDocumentNumber(kind: DocumentKind, month: string, n: number): string {
  return `${PREFIX[kind]}-${month}-${String(n).padStart(3, '0')}`;
}

/** The part of a transaction client the counter uses. */
export interface DocumentNumberClient {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
}

/**
 * The next number of a kind for a move at `at`. The counter row is created or bumped in one
 * statement that holds its row lock until the transaction ends, so two moves in the same month
 * never take the same number, and a move that rolls back gives its number back.
 */
export async function nextDocumentNumber(
  tx: DocumentNumberClient,
  kind: DocumentKind,
  at: Date,
): Promise<string> {
  const month = documentMonth(at);
  const rows = (await tx.$queryRaw(
    Prisma.sql`INSERT INTO document_number_counters (kind, month, last_number) VALUES (${kind}, ${month}, 1) ON CONFLICT (kind, month) DO UPDATE SET last_number = document_number_counters.last_number + 1 RETURNING last_number`,
  )) as { last_number: number }[];
  const [row] = rows;
  if (!row) {
    throw new Error('Document number counter returned no row');
  }
  return formatDocumentNumber(kind, month, Number(row.last_number));
}
