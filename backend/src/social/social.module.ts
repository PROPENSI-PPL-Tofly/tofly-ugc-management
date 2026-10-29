import { Logger, Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { socialWiring } from './social-config.js';
import { SocialConnectController } from './social-connect.controller.js';
import { SocialConnectService } from './social-connect.service.js';

/** Connecting a creator's Instagram or TikTok account (PBI-19). */
@Module({
  imports: [PrismaModule],
  controllers: [SocialConnectController],
  providers: [
    DevCreatorGuard,
    {
      provide: SocialConnectService,
      useFactory: (prisma: PrismaService) => {
        const { providers, signer, linker } = socialWiring(process.env, prisma);
        return new SocialConnectService(
          providers,
          signer,
          linker,
          new Logger('SocialConnect'),
        );
      },
      inject: [PrismaService],
    },
  ],
})
export class SocialModule {}
