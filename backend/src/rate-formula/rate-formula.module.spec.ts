import { MODULE_METADATA } from '@nestjs/common/constants';
import { RateFormulaController } from './rate-formula.controller.js';
import { RateFormulaModule } from './rate-formula.module.js';
import { RateFormulaService } from './rate-formula.service.js';

describe('RateFormulaModule', () => {
  it('registers the rate formula controller and service', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      RateFormulaModule,
    ) as unknown[];

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      RateFormulaModule,
    ) as unknown[];

    expect(controllers).toContain(RateFormulaController);
    expect(providers).toContain(RateFormulaService);
  });

  // The invoice calculation (Subtask 8.2) reads the formula through the service.
  it('exports the service for the invoice calculation to read', () => {
    const exported = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      RateFormulaModule,
    ) as unknown[];

    expect(exported).toContain(RateFormulaService);
  });
});
