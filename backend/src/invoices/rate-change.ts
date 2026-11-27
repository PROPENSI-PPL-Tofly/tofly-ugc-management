// A change of a contract's fixed rate while its invoice ran (PBI-16), as the invoice's "Aktivitas"
// tells it. History only: the amount itself is always calculated from contracts.fixed_rate.
import type { Prisma } from '@prisma/client';
import { adminName } from '../contents/content-event-actors.js';

export const RATE_CHANGES = {
  select: {
    id: true,
    old_rate: true,
    new_rate: true,
    created_at: true,
    users: { select: { email: true, name: true } },
  },
  orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
} satisfies Prisma.invoices$rate_changesArgs;

export type RateChangeRow = Prisma.invoice_rate_changesGetPayload<{
  select: typeof RATE_CHANGES.select;
}>;

export interface RateChangeDto {
  id: string;
  oldRate: number;
  newRate: number;
  /** The admin who changed it, named as every admin action is. */
  actorName: string;
  /** ISO instant. */
  createdAt: string;
}

/** A rate change as the creator reads it: what and when, not which admin. */
export type CreatorRateChangeDto = Omit<RateChangeDto, 'actorName'>;

export function rateChangeDto(row: RateChangeRow): RateChangeDto {
  return {
    id: row.id,
    oldRate: row.old_rate.toNumber(),
    newRate: row.new_rate.toNumber(),
    actorName: adminName(row.users),
    createdAt: row.created_at.toISOString(),
  };
}

/** Named field by field, so a field added for the admin is not shown to the creator. */
export function forCreator({
  id,
  oldRate,
  newRate,
  createdAt,
}: RateChangeDto): CreatorRateChangeDto {
  return { id, oldRate, newRate, createdAt };
}
