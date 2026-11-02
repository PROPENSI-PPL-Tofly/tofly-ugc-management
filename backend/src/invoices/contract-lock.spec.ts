import type { Prisma } from '@prisma/client';
import { lockContractRow } from './contract-lock.js';

describe('lockContractRow', () => {
  it("locks the contract's row FOR UPDATE, with the id as a bound value, never spliced into the SQL", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };

    await lockContractRow(tx, "x'; DROP TABLE contracts; --");

    const [query] = tx.$queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(query.text).toBe(
      'SELECT id FROM contracts WHERE id = $1::uuid FOR UPDATE',
    );
    expect(query.values).toEqual(["x'; DROP TABLE contracts; --"]);
  });
});
