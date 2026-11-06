import { Prisma } from '@prisma/client';

// Every write that reads or changes what an invoice is calculated from takes this lock first,
// inside its transaction, so none of them reads an invoice another is about to freeze.

/** The part of a transaction client the lock uses. */
export interface ContractLockClient {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
}

/** Locks the contract row until the transaction ends. */
export async function lockContractRow(
  tx: ContractLockClient,
  contractId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`,
  );
}

/** Locks the contract the content belongs to until the transaction ends; no row when there is no content. */
export async function lockContractOfContent(
  tx: ContractLockClient,
  contentId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT contracts.id FROM contracts JOIN contents ON contents.contract_id = contracts.id WHERE contents.id = ${contentId}::uuid FOR UPDATE OF contracts`,
  );
}
