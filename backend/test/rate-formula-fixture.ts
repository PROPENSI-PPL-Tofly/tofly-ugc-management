import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { RateFormulaService } from '../src/rate-formula/rate-formula.service.js';

type Formula = Parameters<RateFormulaService['replace']>[0];

/**
 * Saves `formula` as the one Atur Formula Rate row for a suite, and returns the step that puts
 * back whatever was saved before (or none), so suites sharing the database never see each
 * other's formula.
 */
export async function useFormula(
  app: INestApplication,
  prisma: PrismaService,
  formula: Formula,
): Promise<() => Promise<void>> {
  const formulas = app.get(RateFormulaService);
  const saved = await formulas.read();
  await formulas.replace(formula, undefined);

  return async () => {
    if (saved.configured) {
      const { configured: _, updatedAt: __, ...previous } = saved;
      await formulas.replace(previous as Formula, undefined);
      return;
    }
    await prisma.$executeRaw`delete from performance_bonus_tiers`;
    await prisma.$executeRaw`delete from performance_bonus_metrics`;
    await prisma.$executeRaw`delete from rate_formula`;
  };
}
