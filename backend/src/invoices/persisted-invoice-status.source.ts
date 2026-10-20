// Where each invoice stands, read from the lifecycle PBI-12 saves in the invoices table. A
// contract nobody has adjusted or finalized has no row yet and is still accruing.

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  invoiceState,
  type InvoiceLifecycleStatus,
} from './invoice-lifecycle.js';
import type { InvoiceStatus, InvoiceStatusSource } from './invoice-status.js';

/** The one query this source runs. */
export interface InvoiceStatusRows {
  invoices: {
    findMany(args: {
      where: { contract_id: { in: string[] } };
      select: { contract_id: true; status: true };
    }): Promise<{ contract_id: string; status: InvoiceLifecycleStatus }[]>;
  };
}

@Injectable()
export class PersistedInvoiceStatusSource implements InvoiceStatusSource {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoiceStatusRows,
  ) {}

  async statuses(
    contractIds: readonly string[],
  ): Promise<ReadonlyMap<string, InvoiceStatus>> {
    if (contractIds.length === 0) return new Map();

    const saved = await this.prisma.invoices.findMany({
      where: { contract_id: { in: [...contractIds] } },
      select: { contract_id: true, status: true },
    });

    const statuses = new Map<string, InvoiceStatus>(
      contractIds.map((id) => [id, invoiceState('running').pipelineStatus]),
    );

    for (const invoice of saved) {
      statuses.set(
        invoice.contract_id,
        invoiceState(invoice.status).pipelineStatus,
      );
    }

    return statuses;
  }
}
