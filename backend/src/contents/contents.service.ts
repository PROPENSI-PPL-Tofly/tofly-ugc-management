import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { evergreenName, jakartaDay } from '../creators/evergreen.js';
import { DEFAULT_BUFFER_DAYS } from '../creators/new-creator.js';
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

interface CreatorName {
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
}

interface ExistingContent {
  type: string;
}

interface ContentContract {
  start_date: Date;
  end_date: Date;

  // These fields are included by the actual Prisma query.
  // They are optional here because the Specific-content unit tests
  // use smaller contract mocks that do not need them.
  creators?: CreatorName;
  contents?: ExistingContent[];
}

interface SavedContent {
  id: string;
  contract_id: string;
  type: string;
  name: string;
  brief: string;
  deadline: Date;
  status: string;
}

interface SchedulingDependencies {
  today(): Date;
  bufferDays(): Promise<number>;
}

export interface ContentsClient {
  contracts: {
    findUnique: (args: {
      where: { id: string };
      include: {
        creators: true;
        contents: true;
      };
    }) => Promise<ContentContract | null>;
  };

  contents: {
    create: (args: {
      data: {
        contract_id: string;
        type: 'evergreen' | 'specific';
        name: string;
        brief: string;
        deadline: Date;
        status: 'scheduled';
      };
    }) => Promise<SavedContent>;
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
      bufferDays: async () => DEFAULT_BUFFER_DAYS,
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
      type: input.type,
      name: saved.name,
      brief: saved.brief,
      deadline: toDay(saved.deadline),
      status: 'scheduled',
    };
  }

  private async validateDeadline(
    deadline: string,
    contract: ContentContract,
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
    contract: ContentContract,
    deadline: string,
  ): string {
    // The real database query includes both relations.
    // This check also keeps the method safe if a future caller
    // supplies a contract without the required Evergreen data.
    if (!contract.creators || !contract.contents) {
      throw new Error('Data kreator atau konten kontrak tidak lengkap');
    }

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

  private async requireContract(contractId: string): Promise<ContentContract> {
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
