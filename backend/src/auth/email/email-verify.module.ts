import { Logger, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SESSION_STARTER, type SessionStarter } from '../google/ports.js';
import { PrismaWhitelistResolver } from '../google/prisma-whitelist-resolver.js';
import { SessionModule } from '../session/session.module.js';
import { EmailSignInService } from './email-sign-in.service.js';
import {
  EMAIL_SIGN_IN,
  EmailVerifyController,
} from './email-verify.controller.js';
import { loginCodeSecret } from './login-code-config.js';
import { loginCodeHasher } from './login-code-hash.js';
import {
  LOGIN_CODE_STORE,
  type LoginCodeStore,
} from './login-code-store.js';
import { PrismaLoginCodeStore } from './prisma-login-code-store.js';

@Module({
  imports: [PrismaModule, SessionModule],
  controllers: [EmailVerifyController],
  providers: [
    {
      provide: LOGIN_CODE_STORE,
      useFactory: (prisma: PrismaService) => new PrismaLoginCodeStore(prisma),
      inject: [PrismaService],
    },
    {
      provide: EMAIL_SIGN_IN,
      useFactory: (
        codes: LoginCodeStore,
        prisma: PrismaService,
        session: SessionStarter,
      ) =>
        new EmailSignInService(
          codes,
          new PrismaWhitelistResolver(prisma),
          session,
          loginCodeHasher(loginCodeSecret(process.env)),
          new Logger('EmailSignIn'),
        ),
      inject: [LOGIN_CODE_STORE, PrismaService, SESSION_STARTER],
    },
  ],
})
export class EmailVerifyModule {}
