import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesModule } from './invoices.module.js';
import { InvoicesService } from './invoices.service.js';
import {
  PlaceholderRateFormulaSource,
  RATE_FORMULA_SOURCE,
} from './rate-formula.js';

describe('InvoicesModule', () => {
  it('registers the invoices controller and service', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, InvoicesModule),
    ).toContain(InvoicesController);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContain(InvoicesService);
  });

  it('serves the placeholder formula until the stored one from 8.1 exists', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoicesModule),
    ).toContainEqual({
      provide: RATE_FORMULA_SOURCE,
      useClass: PlaceholderRateFormulaSource,
    });
  });
});
