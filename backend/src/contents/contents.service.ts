import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { evergreenName, jakartaDay } from '../creators/evergreen.js';
import { DEFAULT_BUFFER_DAYS } from '../creators/new-creator.js';
import { checkEvergreenSlot } from '../creators/evergreen-slot.js';
import type { NewContent } from './new-content.js';

function toDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

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

  content_quota: number;
  creators: CreatorName;
  contents: ExistingContent[];
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

export interface ContentsTransaction {
  $queryRaw: (query: Prisma.Sql) => Promise<unknown>;
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

export interface ContentsClient {
  $transaction<T>(
    work: (transaction: ContentsTransaction) => Promise<T>,
    options: { isolationLevel: 'ReadCommitted' },
  ): Promise<T>;
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
    return this.prisma.$transaction(
      async (transaction) => {
        // Lock before reading: the next request must see the preceding insert
        // before checking quota and assigning an Evergreen sequence.
        await transaction.$queryRaw(Prisma.sql`
      SELECT id FROM contracts WHERE id = ${input.contractId}::uuid FOR UPDATE
    `);
        const contract = await this.requireContract(
          transaction,
          input.contractId,
        );

        const evergreenCount = contract.contents.filter(
          (content) => content.type === 'evergreen',
        ).length;
        await this.validateSlot(input, contract, evergreenCount);

        let name: string;
        let brief: string;

        if (input.type === 'evergreen') {
          name = this.generateEvergreenName(
            contract,
            input.deadline,
            evergreenCount,
          );
          brief = '';
        } else {
          name = input.name!;
          brief = input.brief!;
        }

        const saved = await transaction.contents.create({
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
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async validateSlot(
    input: NewContent,
    contract: ContentContract,
    evergreenCount: number,
  ): Promise<void> {
    const { contentType, deadline } = checkEvergreenSlot(
      input.type,
      input.deadline,
      {
        contractStart: toDay(contract.start_date),
        contractEnd: toDay(contract.end_date),
        contentQuota: contract.content_quota,
        evergreenScheduledCount: evergreenCount,
        bufferDays: await this.scheduling.bufferDays(),
      },
      jakartaDay(this.scheduling.today()),
    );
    // SCRUM-103 calls this field contentType; the HTTP request uses type.
    const errors = {
      ...(contentType ? { type: contentType } : {}),
      ...(deadline ? { deadline } : {}),
    };
    if (Object.keys(errors).length > 0) {
      throw new UnprocessableEntityException({
        message: 'Data konten tidak valid',
        errors,
      });
    }
  }

  private generateEvergreenName(
    contract: ContentContract,
    deadline: string,
    evergreenCount: number,
  ): string {
    const creator = contract.creators;

    const fullName = [
      creator.first_name,
      creator.middle_name,
      creator.last_name,
    ]
      .filter(Boolean)
      .join(' ');

    return evergreenName(fullName, deadline, evergreenCount + 1);
  }

  private async requireContract(
    transaction: ContentsTransaction,
    contractId: string,
  ): Promise<ContentContract> {
    const contract = await transaction.contracts.findUnique({
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
