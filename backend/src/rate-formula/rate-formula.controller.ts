import { Body, Controller, Get, Inject, Put, Req, UseGuards } from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { checkRateFormula } from './rate-formula.js';
import { RateFormulaService, type RateFormulaView } from './rate-formula.service.js';

/** The Atur Formula Rate settings (PBI-8), for admins only. */
@Controller('rate-formula')
@UseGuards(AdminGuard)
export class RateFormulaController {
  constructor(
    @Inject(RateFormulaService)
    private readonly formulas: Pick<RateFormulaService, 'read' | 'replace'>,
  ) {}

  @Get()
  read(): Promise<RateFormulaView> {
    return this.formulas.read();
  }

  /**
   * Replaces the whole formula. The admin who saved it is the signed-in one; behind the local
   * development stand-in, which signs nobody in, it is recorded as nobody.
   */
  @Put()
  async replace(
    @Body() body: unknown,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<RateFormulaView> {
    const formula = checkRateFormula(body);
    return this.formulas.replace(formula, request.principal?.userId);
  }
}
