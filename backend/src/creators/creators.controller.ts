import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CreatorsService } from './creators.service.js';
import type { CreatorDetail, CreatorListResponse } from './dto/creator-summary.dto.js';
import { ListCreatorsQuery } from './dto/list-creators.query.js';

// Thin on purpose: the controller validates the edge and delegates. Keeping it free of
// logic is also what makes adding authentication later a one-line change here rather than
// a rewrite of everything it touches.
//
// The coverage hint covers a branch the compiler emits, not one written here: decorator
// metadata guards the constructor's parameter type with `typeof X === "undefined" ?`, and
// the fallback can never run because the class is always defined.
/* v8 ignore start */
@Controller('creators')
/* v8 ignore stop */
export class CreatorsController {
  constructor(private readonly creators: CreatorsService) {}

  @Get()
  list(@Query() query: ListCreatorsQuery): Promise<CreatorListResponse> {
    return this.creators.list(query);
  }

  // ParseUUIDPipe turns a malformed id into a 400 before it reaches the database, so a
  // caller cannot probe with arbitrary strings and read the difference in the errors.
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CreatorDetail> {
    return this.creators.findOne(id);
  }
}
