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
import { AppSessionService } from '../auth/session/session.service.js';
import { SuperAdminGuard } from '../auth/super-admin.guard.js';
import { checkPaging, DEFAULT_PAGE_SIZE } from '../creators/paging.js';
import { searchText } from '../list-query.js';
import { AdminConfirmationService } from './admin-confirmation.service.js';
import {
  checkAdminChange,
  checkConfirmationCode,
  checkNewAdmin,
} from './admin-user-input.js';
import { AdminUsersService } from './admin-users.service.js';
import type {
  AdminUserDto,
  AdminUserListResponse,
} from './dto/admin-user.dto.js';

type SignedIn = Pick<AdminRequest, 'principal' | 'cookies'>;

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
    @Inject(AppSessionService) private readonly sessions: AppSessionService,
    @Inject(AdminConfirmationService)
    private readonly confirmation: AdminConfirmationService,
  ) {}

  /** The opaque session id from the cookie; SuperAdminGuard already checked it. */
  private sessionOf(request: SignedIn): string {
    const id = request.cookies?.[this.sessions.cookieName()];
    return typeof id === 'string' ? id : '';
  }

  /** Whether this session entered the emailed code in the last 15 minutes. */
  private async confirmed(request: SignedIn): Promise<boolean> {
    return this.sessions.isConfirmed(this.sessionOf(request));
  }

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
    const input = checkNewAdmin(body);
    return this.admins.create(input, actor, await this.confirmed(request));
  }

  /** Emails a code to the signed-in Super Admin before a sensitive change (OWASP A07:2025). */
  @Post('confirmation')
  @HttpCode(200)
  async requestConfirmation(
    @Req() request: SignedIn,
  ): Promise<{ validMinutes: number }> {
    return this.confirmation.request(actorOf(request));
  }

  /** The right code confirms this session only, for 15 minutes. */
  @Post('confirmation/verify')
  @HttpCode(200)
  async verifyConfirmation(
    @Body() body: unknown,
    @Req() request: SignedIn,
  ): Promise<{ confirmedUntil: string }> {
    const actor = actorOf(request);
    const code = checkConfirmationCode(body);
    return this.confirmation.verify(actor, this.sessionOf(request), code);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: SignedIn,
  ): Promise<AdminUserDto> {
    const actor = actorOf(request);
    const change = checkAdminChange(body);
    return this.admins.update(id, change, actor, await this.confirmed(request));
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: SignedIn,
  ): Promise<AdminUserDto> {
    const actor = actorOf(request);
    return this.admins.deactivate(id, actor, await this.confirmed(request));
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  async reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: SignedIn,
  ): Promise<AdminUserDto> {
    const actor = actorOf(request);
    return this.admins.reactivate(id, actor, await this.confirmed(request));
  }
}
