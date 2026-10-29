import { Logger, Module } from '@nestjs/common';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type { WarningLog } from '../auth/google/google-sign-in.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
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
import { storageNotReady } from './unready-store.js';

// The controller refuses before reaching the client while the app is unconfigured; this only
// keeps the use case whole.
const unconfiguredClient = {
  connect: (): Promise<InstagramAccount> =>
    Promise.reject(
      new InstagramApiError('platform_error', 'Instagram is not configured'),
    ),
};

// Connecting creators' social accounts (PBI-19). 19.3 replaces SOCIAL_ACCOUNT_STORE with the
// encrypted account storage.
@Module({
  // The creator guard reads the creator from the database.
  imports: [PrismaModule],
  controllers: [InstagramConnectController],
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
  ],
})
export class SocialModule {}
