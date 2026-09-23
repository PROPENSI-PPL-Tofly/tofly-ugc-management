import { Body, Controller, Post } from '@nestjs/common';
import { ContentsService, type ContentResponse } from './contents.service.js';
import { ManualSlotDto } from './dto/manual-slot.dto.js';

@Controller('contents')
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @Post('manual-slot')
  assignManualSlot(@Body() dto: ManualSlotDto): Promise<ContentResponse> {
    return this.contentsService.assignManualSlot(dto);
  }
}
