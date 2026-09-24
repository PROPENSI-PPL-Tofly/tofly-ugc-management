
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { evergreenName } from '../creators/evergreen.js';
import type { NewContent } from './new-content.js';

// Convert a YYYY-MM-DD string to a Date object at midnight UTC.
function toDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

// Convert a Date object to a YYYY-MM-DD string.
function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface CreatedContent {
  id: string;
  contractId: string;
  type: 'evergreen' | 'specific';
  name: string;
  brief: string;
  deadline: string;
  status: 'scheduled';
}

interface EvergreenContract {
  creators: {
    first_name: string;
    middle_name: string | null;
    last_name: string | null;
  };
  contents: Array<{ type: string }>;
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

  async create(input: NewContent): Promise<CreatedContent> {
    const contract = await this.requireContract(input.contractId);

    let name: string;
    let brief: string;

    if (input.type === 'evergreen') {
      name = this.generateEvergreenName(contract, input.deadline);
      brief = '';
    } else {
      name = input.name!;
      brief = input.brief!;
    }

    const saved = await this.prisma.contents.create({
      data: {
        contract_id: input.contractId,
        type: input.type,
        name,
        brief,
        deadline: toDate(input.deadline),
        status: 'scheduled',
      },
    });

    return {
      id: saved.id,
      contractId: saved.contract_id,
      type: saved.type,
      name: saved.name,
      brief: saved.brief,
      deadline: toDay(saved.deadline),
      status: saved.status,
    };
  }

  private generateEvergreenName(
    contract: EvergreenContract,
    deadline: string,
  ): string {
    const creator = contract.creators;

    const fullName = [
      creator.first_name,
      creator.middle_name,
      creator.last_name,
    ]
      .filter(Boolean)
      .join(' ');

    const existingEvergreenCount = contract.contents.filter(
      (content) => content.type === 'evergreen',
    ).length;

    return evergreenName(
      fullName,
      deadline,
      existingEvergreenCount + 1,
    );
  }

  private async requireContract(contractId: string): Promise<any> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
      include: {
        creators: true,
        contents: true,
      },
    });

    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'Kontrak tidak ditemukan',
      });
    }

    return contract;
  }
}