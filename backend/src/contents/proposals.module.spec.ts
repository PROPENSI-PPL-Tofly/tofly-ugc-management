import { MODULE_METADATA } from '@nestjs/common/constants';
import { CreatorEmails } from '../email/creator-emails.js';
import { EmailModule } from '../email/email.module.js';
import { PROPOSAL_NOTIFIER } from './proposal-review.service.js';
import { ProposalsModule } from './proposals.module.js';

describe('ProposalsModule', () => {
  // PBI-11 (11.1): a rejected proposal reaches its creator by email, not the old mock.
  it('tells the creator of a rejected proposal through the creator emails', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProposalsModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProposalsModule) as unknown[];

    expect(imports).toContain(EmailModule);
    expect(providers).toContainEqual({ provide: PROPOSAL_NOTIFIER, useExisting: CreatorEmails });
  });
});
