import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
    const saved = await this.prisma.contents.create({
      data: {
        contract_id: input.contractId,
        type: 'specific',
        name: input.name,
        brief: input.brief,
        deadline: new Date(`${input.deadline}T00:00:00.000Z`),
        status: 'scheduled',
      },
    });

    return {
      id: saved.id,
      contractId: saved.contract_id,
      type: 'specific',
      name: saved.name,
      brief: saved.brief,
      deadline: saved.deadline.toISOString().slice(0, 10),
      status: 'scheduled',
    };
  }
}