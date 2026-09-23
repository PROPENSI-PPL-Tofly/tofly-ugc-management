import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreatorOnboardingService,
  type CreatorOnboarder,
} from './creator-onboarding.service.js';
import { CreatorsService, type CreatorLister } from './creators.service.js';
import type {
  CreatorDetail,
  CreatorListResponse,
} from './dto/creator-summary.dto.js';
import type {
  NewCreator as OnboardingInput,
  OnboardedCreator,
} from './dto/new-creator.dto.js';
import { checkFilters } from './filters.js';
import { checkNewCreator, type NewCreator } from './new-creator.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from './paging.js';

/** checkNewCreator speaks in database terms; onboarding takes the form's shape back. */
function onboardingInput(creator: NewCreator): OnboardingInput {
  const day = (date: Date): string => date.toISOString().slice(0, 10);
  return {
    name: [creator.firstName, creator.middleName, creator.lastName]
      .filter(Boolean)
      .join(' '),
    email: creator.email,
    contractStart: day(creator.contractStart),
    contractEnd: day(creator.contractEnd),
    interval: creator.interval,
    quota: creator.quota,
    fixedRate: creator.fixedRate,
    socialPlatform: creator.socialPlatform,
    socialUsername: creator.socialUsername,
    deadlines: creator.deadlines.map(day),
  };
}

@Controller('creators')
export class CreatorsController {
  constructor(
    @Inject(CreatorsService) private readonly creators: CreatorLister,
    @Inject(CreatorOnboardingService)
    private readonly onboarding: CreatorOnboarder,
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

  /**
   * Add Creator (PRD 3.4). The body is taken as `unknown` and checked field by field by
   * checkNewCreator, which answers anything invalid with a 422 listing each field; only the
   * validated NewCreator reaches onboarding. Nest answers a POST with 201 Created.
   *
   * No guard yet: the backend has no authentication, so for now anyone who can reach the API
   * can add a creator. Admin-only access belongs with the Google sign-in work (PRD 3.1).
   */
  @Post()
  async create(@Body() body: unknown): Promise<OnboardedCreator> {
    const now = new Date();
    return this.onboarding.onboard(
      onboardingInput(checkNewCreator(body, now)),
      now,
    );
  }
}
