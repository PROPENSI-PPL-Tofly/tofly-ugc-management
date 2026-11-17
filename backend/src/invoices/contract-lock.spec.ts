import type { Prisma } from '@prisma/client';
import { lockContractOfContent, lockContractRow } from './contract-lock.js';

const CONTRACT_ID = '5b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';

function client() {
  const $queryRaw = vi.fn<(query: Prisma.Sql) => Promise<unknown>>();
  return { $queryRaw };
}

describe('contract lock', () => {
  it('locks the contract row by its id, passed as a bound value', async () => {
    const tx = client();

    await lockContractRow(tx, CONTRACT_ID);

    const [query] = tx.$queryRaw.mock.calls[0];
    expect(query.text).toBe(
      'SELECT id FROM contracts WHERE id = $1::uuid FOR UPDATE',
    );
    expect(query.values).toEqual([CONTRACT_ID]);
  });

  it("locks only the content's contract row, never the content, with the id bound", async () => {
    const tx = client();

    await lockContractOfContent(tx, CONTENT_ID);

    const [query] = tx.$queryRaw.mock.calls[0];
    expect(query.text).toBe(
      'SELECT contracts.id FROM contracts JOIN contents ON contents.contract_id = contracts.id WHERE contents.id = $1::uuid FOR UPDATE OF contracts',
    );
    expect(query.values).toEqual([CONTENT_ID]);
  });
});
