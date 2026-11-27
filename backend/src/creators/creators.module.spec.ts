import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuditLogger } from '../audit/audit-logger.js';
import { CreatorEmails } from '../email/creator-emails.js';
import { CREATOR_NOTIFIER } from '../email/creator-notifier.js';
import { EmailModule } from '../email/email.module.js';
import { CONTRACT_END_AUDIT } from './contract-end-audit.js';
import {
  CREATOR_EDIT_AUDIT,
  CREATOR_EDIT_NOTIFIER,
} from './creator-edit-ports.js';
import { CreatorsModule } from './creators.module.js';

describe('CreatorsModule', () => {
  // PBI-11 (11.2): a new account, a new period and an early end email the creator.
  it('hands its services the creator emails', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CreatorsModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CreatorsModule,
    ) as unknown[];

    expect(imports).toContain(EmailModule);
    expect(providers).toContainEqual({
      provide: CREATOR_NOTIFIER,
      useExisting: CreatorEmails,
    });
  });

  // PBI-16 (QA): a new end date or quota sent no email; the edit was still wired to a stand-in.
  it('emails the creator about a new end date or quota from Ubah Data', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CreatorsModule,
    ) as unknown[];

    expect(providers).toContainEqual({
      provide: CREATOR_EDIT_NOTIFIER,
      useExisting: CreatorEmails,
    });
  });

  // PBI-23 (OWASP A09:2025): an early end (PBI-37) and an Ubah Data edit (PBI-16) are written to
  // Log Aktivitas by the one AuditLogger, on the transaction of the change they record.
  it('hands an early end and an Ubah Data edit the AuditLogger', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CreatorsModule,
    ) as unknown[];

    expect(providers).toContainEqual({
      provide: CONTRACT_END_AUDIT,
      useExisting: AuditLogger,
    });
    expect(providers).toContainEqual({
      provide: CREATOR_EDIT_AUDIT,
      useExisting: AuditLogger,
    });
  });
});
