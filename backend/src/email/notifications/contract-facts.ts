import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { InvoiceFacts, PeriodFacts } from './notification-templates.js';

// The invoice emails' own facts (11.4): 11.2's triggers send only the contract id, so the period
// number and the total are read here when the email is rendered — on the first send and again on
// a retry, so the 08:00 run words a failed email from the same saved invoice.

/** The contract or its finalized invoice is not there; the email fails and is retried (AC 9). */
export class ContractFactsMissing extends Error {}

const SELECT = {
  id: true,
  // Every period of the creator in the order they started, numbered as Pembayaran and the
  // PBI-31 PDF number them (invoice-pdf.service.ts).
  creators: {
    select: {
      contracts: {
        select: { id: true },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
      },
    },
  },
  invoice: { select: { snapshot: true } },
} as const;

interface ContractRow {
  id: string;
  creators: { contracts: { id: string }[] };
  invoice: { snapshot: unknown } | null;
}

/** The slice of Prisma the reader uses, so tests hand in a stub of just that. */
export interface ContractFactsClient {
  contracts: {
    findUnique(args: {
      where: { id: string };
      select: typeof SELECT;
    }): Promise<ContractRow | null>;
  };
}

export interface ContractFacts {
  period(contractId: string): Promise<PeriodFacts>;
  invoice(contractId: string): Promise<InvoiceFacts>;
}

@Injectable()
export class PrismaContractFacts implements ContractFacts {
  constructor(
    @Inject(PrismaService) private readonly prisma: ContractFactsClient,
  ) {}

  async period(contractId: string): Promise<PeriodFacts> {
    const contract = await this.contract(contractId);
    return { periodNumber: periodNumber(contract) };
  }

  async invoice(contractId: string): Promise<InvoiceFacts> {
    const contract = await this.contract(contractId);
    const total = (
      contract.invoice?.snapshot as { total?: unknown } | null | undefined
    )?.total;
    // No snapshot is no finalized invoice: there is no amount to tell the creator yet.
    if (typeof total !== 'number') {
      throw new ContractFactsMissing('The invoice has no saved total');
    }
    return { periodNumber: periodNumber(contract), total };
  }

  private async contract(contractId: string): Promise<ContractRow> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
      select: SELECT,
    });
    if (!contract) throw new ContractFactsMissing('The contract is gone');
    return contract;
  }
}

function periodNumber(contract: ContractRow): number {
  return (
    contract.creators.contracts.findIndex(({ id }) => id === contract.id) + 1
  );
}
