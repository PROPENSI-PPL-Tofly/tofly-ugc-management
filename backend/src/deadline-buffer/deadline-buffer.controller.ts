import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminRequest } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { checkBufferDays } from './deadline-buffer-input.js';
import {
  DeadlineBufferService,
  type DeadlineBufferView,
} from './deadline-buffer.service.js';

/**
 * "Atur Buffer Deadline" (PBI-23 AC 20-24, SCRUM-298). Guards sit on each route, not the
 * controller: every creator's and Admin's form reads the buffer (AC 24), and only a Super Admin
 * changes it (OWASP A01:2025). Neither answer may stay in a cache, so no form validates with a
 * buffer from before a save (OWASP A02:2025).
 */
@Controller('deadline-buffer')
export class DeadlineBufferController {
  constructor(
    @Inject(DeadlineBufferService)
    private readonly buffer: Pick<DeadlineBufferService, 'view' | 'replace'>,
  ) {}

  @Get()
  @UseGuards(CreatorOrAdminGuard)
  @Header('Cache-Control', 'no-store')
  read(): Promise<DeadlineBufferView> {
    return this.buffer.view();
  }

  /** The Super Admin who saved it is the signed-in one; the local stand-in signs nobody in. */
  @Put()
  @UseGuards(SuperAdminGuard)
  @Header('Cache-Control', 'no-store')
  replace(
    @Body() body: unknown,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<DeadlineBufferView> {
    return this.buffer.replace(
      checkBufferDays(body),
      request.principal?.userId,
    );
  }
}
