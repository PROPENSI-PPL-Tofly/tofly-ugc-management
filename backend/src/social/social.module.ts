import { Logger, Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type { WarningLog } from '../auth/google/google-sign-in.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  InstagramApiError,
  InstagramClient,
  type InstagramAccount,
} from './instagram/instagram-client.js';
import {
  instagramConfig,
  type InstagramConfig,
} from './instagram/instagram-config.js';
import {
  INSTAGRAM_CONFIG,
  INSTAGRAM_CONNECT,
  INSTAGRAM_LOG,
  InstagramConnectController,
} from './instagram/instagram-connect.controller.js';
import { InstagramConnectService } from './instagram/instagram-connect.service.js';
import { SOCIAL_ACCOUNT_STORE, type SocialAccountStore } from './ports.js';
import { socialWiring } from './social-config.js';
import { SocialConnectController } from './social-connect.controller.js';
import { SocialConnectService } from './social-connect.service.js';
import { storageNotReady } from './unready-store.js';

// The controller refuses before reaching the client while the app is unconfigured; this only
// keeps the use case whole.
const unconfiguredClient = {
  connect: (): Promise<InstagramAccount> =>
    Promise.reject(
      new InstagramApiError('platform_error', 'Instagram is not configured'),
    ),
};

// Connecting creators' social accounts (PBI-19). Instagram (19.1) still has its own controller;
// TikTok (19.2) goes through the platform-generic one, until Instagram becomes its second
// SocialOAuthProvider and SOCIAL_ACCOUNT_STORE gives way to the encrypted SocialAccountLinker.
@Module({
  // The creator guard reads the creator from the database.
  imports: [PrismaModule],
  // Order matters: Express matches routes in the order they are registered, so Instagram's own
  // /social/instagram/… must come before the generic /social/:platform/… would catch it.
  controllers: [InstagramConnectController, SocialConnectController],
  providers: [
    DevCreatorGuard,
    {
      provide: INSTAGRAM_CONFIG,
      useFactory: () => instagramConfig(process.env),
    },
    { provide: INSTAGRAM_LOG, useValue: new Logger('InstagramConnect') },
    { provide: SOCIAL_ACCOUNT_STORE, useValue: storageNotReady },
    {
      provide: INSTAGRAM_CONNECT,
      useFactory: (
        config: InstagramConfig | undefined,
        store: SocialAccountStore,
        log: WarningLog,
      ) =>
        new InstagramConnectService(
          config ? new InstagramClient(config) : unconfiguredClient,
          store,
          log,
        ),
      inject: [INSTAGRAM_CONFIG, SOCIAL_ACCOUNT_STORE, INSTAGRAM_LOG],
    },
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
