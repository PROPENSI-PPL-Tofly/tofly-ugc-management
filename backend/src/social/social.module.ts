import { Logger, Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MySocialAccountsController } from './my-social-accounts.controller.js';
import { MySocialAccountsService } from './my-social-accounts.service.js';
import {
  SOCIAL_WIRING,
  socialWiring,
  type SocialWiring,
} from './social-config.js';
import { SocialConnectController } from './social-connect.controller.js';
import { SocialConnectService } from './social-connect.service.js';

// Connecting creators' social accounts (PBI-19). Instagram (19.1) and TikTok (19.2) are both
// SocialOAuthProviders behind the one generic controller, and both keep their accounts through
// the one encrypted SocialAccountLinker.
@Module({
  // The creator guard reads the creator from the database.
  imports: [PrismaModule],
  controllers: [SocialConnectController, MySocialAccountsController],
  providers: [
    DevCreatorGuard,
    MySocialAccountsService,
    {
      provide: SOCIAL_WIRING,
      useFactory: (prisma: PrismaService) => socialWiring(process.env, prisma),
      inject: [PrismaService],
    },
    {
      provide: SocialConnectService,
      useFactory: ({ providers, signer, linker }: SocialWiring) =>
        new SocialConnectService(
          providers,
          signer,
          linker,
          new Logger('SocialConnect'),
        ),
      inject: [SOCIAL_WIRING],
    },
  ],
})
export class SocialModule {}
