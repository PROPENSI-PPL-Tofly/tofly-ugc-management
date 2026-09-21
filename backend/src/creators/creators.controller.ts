import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CreatorsService, type CreatorLister } from './creators.service.js';
import type { CreatorListResponse } from './dto/creator-summary.dto.js';
import {
  parseFilterQuery,
  type CreatorFilters,
} from './dto/parse-filter-query.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from './paging.js';

@Controller('creators')
export class CreatorsController {
  constructor(
    @Inject(CreatorsService) private readonly creators: CreatorLister,
  ) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    pageSize: number,
    @Query('q') q?: string,
    @Query('contract') contract?: string,
    @Query('productivity') productivity?: string,
  ): Promise<CreatorListResponse> {
    const filters = parseFilterQuery({ q, contract, productivity });
    return this.creators.list(checkPaging(page, pageSize), undefined, filters);
  }
}
