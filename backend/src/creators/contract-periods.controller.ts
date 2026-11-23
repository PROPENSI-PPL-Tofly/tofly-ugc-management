import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { checkNewPeriod } from './contract-period.js';
import {
  ContractPeriodsService,
  type PeriodKeeper,
} from './contract-periods.service.js';
import type { SavedPeriod } from './dto/contract-period.dto.js';

type SignedIn = Pick<AdminRequest, 'principal'>;

/**
 * A creator's contract periods (PBI-30). The body is taken as `unknown` and checked by
 * checkNewPeriod with the Tambah Creator rules; only the validated terms reach the service.
 * ParseUUIDPipe keeps a malformed id from reaching the database.
 */
@Controller('creators/:id/contracts')
@UseGuards(AdminGuard)
export class ContractPeriodsController {
  constructor(
    @Inject(ContractPeriodsService) private readonly periods: PeriodKeeper,
  ) {}

  /** "Perpanjang Kontrak": a new period with its own invoice and Evergreen schedule. */
  @Post()
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() request: SignedIn,
  ): Promise<SavedPeriod> {
    const now = new Date();
    // The admin the guard signed in; absent only behind the local development stand-in.
    return this.periods.create(
      id,
      checkNewPeriod(body, now),
      now,
      request.principal?.userId,
    );
  }

  /** Changes a period that has not started; its Evergreen schedule is generated again. */
  @Put(':contractId')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: unknown,
    @Req() request: SignedIn,
  ): Promise<SavedPeriod> {
    const now = new Date();
    // A started period is refused as such before its body is judged by the rules for new dates.
    await this.periods.assertEditable(id, contractId, now);
    return this.periods.update(
      id,
      contractId,
      checkNewPeriod(body, now),
      now,
      request.principal?.userId,
    );
  }

  /** Deletes a period that has not started, with its schedule and empty invoice. */
  @Delete(':contractId')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ): Promise<void> {
    await this.periods.remove(id, contractId, new Date());
  }
}
