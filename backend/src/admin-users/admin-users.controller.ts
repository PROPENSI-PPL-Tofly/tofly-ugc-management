import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminRequest } from '../auth/admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import { searchText } from '../list-query.js';
import { checkAdminRename, checkNewAdmin } from './admin-user-input.js';
import { AdminUsersService } from './admin-users.service.js';
import type {
  AdminUserDto,
  AdminUserListResponse,
} from './dto/admin-user.dto.js';

type SignedIn = Pick<AdminRequest, 'principal'>;

/** The Super Admin acting; AdminGuard's local stand-in has none, and nothing changes without one. */
function actorOf(request: SignedIn): string {
  if (request.principal?.role !== 'admin') throw unauthenticated();
  return request.principal.userId;
}

/** "Pengguna Admin" (PBI-23): Super Admins only, everyone else 403 (AC 3, OWASP A01:2025). */
@Controller('admin-users')
@UseGuards(SuperAdminGuard)
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService) private readonly admins: AdminUsersService,
  ) {}

  /** 10 rows a page (AC 4), searched by name or email. */
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('q') q: unknown,
    @Req() request: SignedIn,
  ): Promise<AdminUserListResponse> {
    const actor = actorOf(request);
    return this.admins.list(
      checkPaging(page, DEFAULT_PAGE_SIZE),
      searchText(q),
      actor,
    );
  }

  @Post()
  async create(
    @Body() body: unknown,
    @Req() request: SignedIn,
  ): Promise<AdminUserDto> {
    const actor = actorOf(request);
    return this.admins.create(checkNewAdmin(body), actor);
  }

  @Patch(':id')
  async rename(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: SignedIn,
  ): Promise<AdminUserDto> {
    const actor = actorOf(request);
    return this.admins.rename(id, checkAdminRename(body), actor);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  async reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: SignedIn,
  ): Promise<AdminUserDto> {
    return this.admins.reactivate(id, actorOf(request));
  }
}
