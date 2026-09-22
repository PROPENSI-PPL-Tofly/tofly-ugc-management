import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CreatorsService, type CreatorLister } from './creators.service.js';
import type {
  CreatorDetail,
  CreatorListResponse,
} from './dto/creator-summary.dto.js';
import { checkFilters } from './filters.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from './paging.js';

@Controller('creators')
export class CreatorsController {
  constructor(
    @Inject(CreatorsService) private readonly creators: CreatorLister,
  ) {}

  // The pipes turn anything that is not an integer into a 400 before this runs;
  // checkPaging then keeps the integers inside the range the listing can serve.
  // checkFilters does the same job for q/contractStatus/productivity.
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('q') q?: string,
    @Query('contractStatus') contractStatus?: string,
    @Query('productivity') productivity?: string,
  ): Promise<CreatorListResponse> {
    return this.creators.list(
      checkPaging(page, pageSize),
      new Date(),
      checkFilters(q, contractStatus, productivity),
    );
  }

  /**
   * ParseUUIDPipe prevents malformed IDs from reaching the database.
   * The service handles the valid-but-missing creator case.
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreatorDetail> {
    return this.creators.findOne(id);
  }
}