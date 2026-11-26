import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Inject,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { checkAuditLogQuery } from './audit-log-query.js';
import { AuditLogsService } from './audit-logs.service.js';
import type {
  AuditLogFilterOptions,
  AuditLogListResponse,
} from './dto/audit-log.dto.js';

/**
 * "Log Aktivitas" (PBI-23, SCRUM-296): Super Admins only, everyone else 403 (OWASP A01:2025).
 * Read-only: SCRUM-295's AuditLogger is the only writer, and the table refuses any change. Neither
 * answer may stay in a browser or proxy cache (OWASP A02:2025).
 */
@Controller('audit-logs')
@UseGuards(SuperAdminGuard)
export class AuditLogsController {
  constructor(
    @Inject(AuditLogsService) private readonly logs: AuditLogsService,
  ) {}

  /** 20 entries a page (AC 17); ParseIntPipe and checkAuditLogQuery answer 400 before any read. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query() query: Record<string, unknown>,
  ): Promise<AuditLogListResponse> {
    return this.logs.list(checkAuditLogQuery(page, query));
  }

  @Get('filter-options')
  @Header('Cache-Control', 'no-store')
  async filterOptions(): Promise<AuditLogFilterOptions> {
    return this.logs.filterOptions();
  }
}
