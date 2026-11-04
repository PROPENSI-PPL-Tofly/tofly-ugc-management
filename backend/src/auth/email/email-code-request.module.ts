import { Logger, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrismaWhitelistResolver } from '../google/prisma-whitelist-resolver.js';
import { EmailCodeRequestService } from './email-code-request.service.js';
import {
  EMAIL_CODE_REQUEST,
  EmailRequestController,
} from './email-request.controller.js';
import { loginCodeSecret } from './login-code-config.js';
import { loginCodeHasher } from './login-code-hash.js';
import { LOGIN_CODE_ISSUER, type LoginCodeIssuer } from './login-code-issuer.js';
import { PrismaLoginCodeIssuer } from './prisma-login-code-issuer.js';
import {
  SIGN_IN_CODE_MAILER,
  unreadySignInCodeMailer,
  type SignInCodeMailer,
} from './sign-in-code-mailer.js';

/** POST /auth/email/request (SCRUM-240), kept apart from SCRUM-241's EmailVerifyModule. */
@Module({
  imports: [PrismaModule],
  controllers: [EmailRequestController],
  providers: [
    {
      provide: LOGIN_CODE_ISSUER,
      useFactory: (prisma: PrismaService) => new PrismaLoginCodeIssuer(prisma),
      inject: [PrismaService],
    },
    // PLACEHOLDER: SCRUM-239 binds its EmailSender adapter here.
    { provide: SIGN_IN_CODE_MAILER, useValue: unreadySignInCodeMailer },
    {
      provide: EMAIL_CODE_REQUEST,
      useFactory: (
        issuer: LoginCodeIssuer,
        prisma: PrismaService,
        mailer: SignInCodeMailer,
      ) =>
        new EmailCodeRequestService(
          issuer,
          new PrismaWhitelistResolver(prisma),
          mailer,
          loginCodeHasher(loginCodeSecret(process.env)),
          new Logger('EmailCodeRequest'),
        ),
      inject: [LOGIN_CODE_ISSUER, PrismaService, SIGN_IN_CODE_MAILER],
    },
  ],
})
export class EmailCodeRequestModule {}
