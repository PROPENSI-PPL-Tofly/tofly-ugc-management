import { MODULE_METADATA } from '@nestjs/common/constants';
import { CreatorEmails } from '../email/creator-emails.js';
import { CREATOR_NOTIFIER } from '../email/creator-notifier.js';
import { EmailModule } from '../email/email.module.js';
import { CreatorsModule } from './creators.module.js';

describe('CreatorsModule', () => {
  // PBI-11 (11.2): a new account, a new period and an early end email the creator.
  it('hands its services the creator emails', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CreatorsModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CreatorsModule) as unknown[];

    expect(imports).toContain(EmailModule);
    expect(providers).toContainEqual({ provide: CREATOR_NOTIFIER, useExisting: CreatorEmails });
  });
});
