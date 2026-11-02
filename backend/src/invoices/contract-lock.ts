import { Prisma } from '@prisma/client';

// The one lock every write that reads or changes what an invoice is calculated from takes first,
// inside its transaction: the contract's row. Finalize, a manual adjustment and an admin's manual
// performance numbers (PBI-27) queue on it, so none of them reads an invoice another is about to
// change (OWASP A08:2025). Kept in one place so they all lock the same row the same way.

/** The part of a transaction client the lock uses. */
export interface ContractLockClient {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
}

/** Locks the contract row until the surrounding transaction ends. */
export async function lockContractRow(
  tx: ContractLockClient,
  contractId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`,
  );
}
