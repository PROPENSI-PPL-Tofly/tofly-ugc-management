import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { evergreenName, jakartaDay } from '../creators/evergreen.js';
import type { NewContent } from './new-content.js';

function toDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
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

interface SchedulingDependencies {
  today(): Date;
  bufferDays(): Promise<number>;
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
  private readonly scheduling: SchedulingDependencies;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentsClient,

    @Optional()
    @Inject('CONTENT_SCHEDULING')
    scheduling?: SchedulingDependencies,
  ) {
    this.scheduling = scheduling ?? {
      today: () => new Date(),
      bufferDays: async () => 5,
    };
  }

  async create(input: NewContent): Promise<CreatedContent> {
    const contract = await this.requireContract(input.contractId);

    await this.validateDeadline(input.deadline, contract);

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

  private async validateDeadline(
    deadline: string,
    contract: { start_date: Date; end_date: Date },
  ): Promise<void> {
    const today = jakartaDay(this.scheduling.today());
    const contractStart = toDay(contract.start_date);
    const contractEnd = toDay(contract.end_date);

    const bufferDays = await this.scheduling.bufferDays();
    const baseDay = contractStart > today ? contractStart : today;
    const minimumDeadline = addDays(baseDay, bufferDays);

    if (deadline < minimumDeadline || deadline > contractEnd) {
      throw new UnprocessableEntityException({
        message: 'Data konten tidak valid',
        errors: {
          deadline: 'Deadline harus sesuai periode kontrak dan buffer global',
        },
      });
    }
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

    return evergreenName(fullName, deadline, existingEvergreenCount + 1);
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
