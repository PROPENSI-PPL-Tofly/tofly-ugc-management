import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ManualSlotDto } from './dto/manual-slot.dto.js';

export interface ContentResponse {
  id: string;
  name: string;
  type: string;
  deadline: string;
  status: string;
}

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assignManualSlot(_dto: ManualSlotDto): Promise<ContentResponse> {
    throw new Error('NOT_IMPLEMENTED');
  }
}
