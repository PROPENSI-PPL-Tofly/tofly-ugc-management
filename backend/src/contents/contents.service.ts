import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ManualSlotDto } from './dto/manual-slot.dto.js';

export interface ContentResponse {
  id: string;
  name: string;
  type: string;
  deadline: string;
  status: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assignManualSlot(dto: ManualSlotDto): Promise<ContentResponse> {
    const content = await this.prisma.contents.findUnique({
      where: { id: dto.contentId },
      select: { id: true, contract_id: true },
    });

    if (!content) {
      throw new NotFoundException({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      });
    }

    const contract = await this.prisma.contract.findUnique({
      where: { id: content.contract_id },
      select: { startDate: true, endDate: true },
    });

    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'Kontrak tidak ditemukan',
      });
    }

    const deadline = new Date(`${dto.deadline}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (deadline < today) {
      throw new BadRequestException({
        code: 'DEADLINE_BEFORE_TODAY',
        message: 'Deadline tidak boleh di masa lalu',
      });
    }

    if (deadline < contract.startDate || deadline > contract.endDate) {
      throw new BadRequestException({
        code: 'DEADLINE_OUTSIDE_CONTRACT',
        message: 'Deadline harus dalam masa kontrak',
      });
    }

    const updated = await this.prisma.contents.update({
      where: { id: dto.contentId },
      data: { deadline },
      select: {
        id: true,
        name: true,
        type: true,
        deadline: true,
        status: true,
      },
    });

    this.logger.log(`Content ${updated.id} deadline updated to ${dto.deadline}`);

    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      deadline: isoDate(updated.deadline),
      status: updated.status,
    };
  }
}
