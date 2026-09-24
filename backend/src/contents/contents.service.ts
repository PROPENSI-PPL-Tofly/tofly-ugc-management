
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Convert a YYYY-MM-DD string to a Date object at midnight UTC.
function toDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

// Convert a Date object to a YYYY-MM-DD string.
function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface NewSpecificContent {
  contractId: string;
  type: 'specific';
  deadline: string;
  name: string;
  brief: string;
}

interface CreatedContent {
  id: string;
  contractId: string;
  type: 'specific';
  name: string;
  brief: string;
  deadline: string;
  status: 'scheduled';
}

export interface ContentsClient {
  contracts: {
    findUnique: (...args: any[]) => Promise<any>;
  };
  contents: {
    create: (...args: any[]) => Promise<any>;
  };
}

@Injectable()
export class ContentCreationService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentsClient,
  ) {}

  async create(input: NewSpecificContent): Promise<CreatedContent> {
    await this.requireContract(input.contractId);

    const saved = await this.prisma.contents.create({
      data: {
        contract_id: input.contractId,
        type: 'specific',
        name: input.name,
        brief: input.brief,
        deadline: toDate(input.deadline),
        status: 'scheduled',
      },
    });

    return {
      id: saved.id,
      contractId: saved.contract_id,
      type: 'specific',
      name: saved.name,
      brief: saved.brief,
      deadline: toDay(saved.deadline),
      status: 'scheduled',
    };
  }

  private async requireContract(contractId: string): Promise<void> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'Kontrak tidak ditemukan',
      });
    }
  }
}