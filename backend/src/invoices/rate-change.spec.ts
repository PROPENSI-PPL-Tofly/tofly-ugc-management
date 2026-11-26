import { Prisma } from '@prisma/client';
import { forCreator, rateChangeDto, type RateChangeRow } from './rate-change.js';

const ROW: RateChangeRow = {
  id: 'change-1',
  old_rate: new Prisma.Decimal('4000000.00'),
  new_rate: new Prisma.Decimal('4500000.00'),
  created_at: new Date('2026-11-25T03:00:00.000Z'),
  users: { email: 'rina@example.com' },
};

describe('rateChangeDto', () => {
  it('answers the rates as numbers, who changed it and when', () => {
    expect(rateChangeDto(ROW)).toEqual({
      id: 'change-1',
      oldRate: 4_000_000,
      newRate: 4_500_000,
      actorName: 'rina@example.com',
      createdAt: '2026-11-25T03:00:00.000Z',
    });
  });

  it('names the role when no account is behind the change', () => {
    expect(rateChangeDto({ ...ROW, users: null }).actorName).toBe('Admin');
  });
});

describe('forCreator', () => {
  // OWASP A01: the creator reads what changed and when, never which admin did it.
  it('leaves the admin out', () => {
    expect(forCreator(rateChangeDto(ROW))).toEqual({
      id: 'change-1',
      oldRate: 4_000_000,
      newRate: 4_500_000,
      createdAt: '2026-11-25T03:00:00.000Z',
    });
  });
});
