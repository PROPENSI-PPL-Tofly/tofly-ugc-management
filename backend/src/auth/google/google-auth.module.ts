import { Logger, Module } from '@nestjs/common';
import type { GoogleOAuthConfig } from './authorization.js';
import { flowCookie } from './flow-cookie.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrismaWhitelistResolver } from './prisma-whitelist-resolver.js';
import {
  AUTH_LOG,
  FLOW_COOKIE,
  GOOGLE_OAUTH_CONFIG,
  GoogleAuthController,
  SIGN_IN,
} from './google-auth.controller.js';
import { googleOAuthConfig } from './google-config.js';
import { GoogleIdTokenVerifier } from './google-id-token.js';
import {
  GoogleSignInService,
  type WarningLog,
} from './google-sign-in.service.js';
import {
  GoogleTokenClient,
  type CodeExchanger,
} from './google-token-client.js';
import {
  CODE_EXCHANGER,
  ID_TOKEN_VERIFIER,
  SESSION_STARTER,
  WHITELIST_RESOLVER,
  type IdTokenVerifier,
  type SessionStarter,
  type WhitelistResolver,
} from './ports.js';
import {
  unconfiguredExchanger,
  unconfiguredVerifier,
  unreadySession,
} from './unready-ports.js';

@Module({
  imports: [PrismaModule],
  controllers: [GoogleAuthController],
  providers: [
    {
      provide: GOOGLE_OAUTH_CONFIG,
      useFactory: () => googleOAuthConfig(process.env),
    },
    { provide: FLOW_COOKIE, useFactory: () => flowCookie(process.env) },
    { provide: AUTH_LOG, useValue: new Logger('GoogleSignIn') },
    {
      provide: CODE_EXCHANGER,
      useFactory: (config: GoogleOAuthConfig | undefined): CodeExchanger =>
        config ? new GoogleTokenClient(config) : unconfiguredExchanger,
      inject: [GOOGLE_OAUTH_CONFIG],
    },
    {
      provide: ID_TOKEN_VERIFIER,
      useFactory: (config: GoogleOAuthConfig | undefined): IdTokenVerifier =>
        config
          ? new GoogleIdTokenVerifier(config.clientId)
          : unconfiguredVerifier,
      inject: [GOOGLE_OAUTH_CONFIG],
    },
    {
      provide: WHITELIST_RESOLVER,
      useFactory: (prisma: PrismaService): WhitelistResolver =>
        new PrismaWhitelistResolver(prisma),
      inject: [PrismaService],
    },
    // Replace the default with the real implementation as it lands.
    { provide: SESSION_STARTER, useValue: unreadySession },
    {
      provide: SIGN_IN,
      useFactory: (
        exchanger: CodeExchanger,
        verifier: IdTokenVerifier,
        whitelist: WhitelistResolver,
        session: SessionStarter,
        log: WarningLog,
      ) =>
        new GoogleSignInService(exchanger, verifier, whitelist, session, log),
      inject: [
        CODE_EXCHANGER,
        ID_TOKEN_VERIFIER,
        WHITELIST_RESOLVER,
        SESSION_STARTER,
        AUTH_LOG,
      ],
    },
  ],
})
export class GoogleAuthModule {}
