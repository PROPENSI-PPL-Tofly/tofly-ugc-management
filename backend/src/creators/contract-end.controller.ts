import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import {
  ContractEndService,
  type ContractEnder,
  type EndedContract,
} from './contract-end.service.js';
import type { EarlyEndPlan } from './early-end.js';

type SignedIn = Pick<AdminRequest, 'principal'>;

/**
 * "Akhiri Kontrak Lebih Awal" (PBI-37). The body is taken as `unknown`: it can only be judged
 * against the contract it ends, so the service checks it after reading that contract. ParseUUIDPipe
 * keeps a malformed id from reaching the database.
 */
@Controller('creators/:id/contracts/:contractId/early-end')
@UseGuards(AdminGuard)
export class ContractEndController {
  constructor(
    @Inject(ContractEndService) private readonly contracts: ContractEnder,
  ) {}

  /** The consequences for the confirmation screen; nothing is saved. */
  @Post('preview')
  @HttpCode(200)
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: unknown,
  ): Promise<EarlyEndPlan> {
    return this.contracts.preview(id, contractId, body, new Date());
  }

  /** Ends the contract; final once it answers. */
  @Post()
  @HttpCode(200)
  end(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: unknown,
    @Req() request: SignedIn,
  ): Promise<EndedContract> {
    // The admin the guard signed in; absent only behind the local development stand-in.
    return this.contracts.end(id, contractId, body, new Date(), request.principal?.userId);
  }
}
