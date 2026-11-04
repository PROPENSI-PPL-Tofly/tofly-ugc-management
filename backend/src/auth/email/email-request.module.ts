import { Logger, Module } from '@nestjs/common';
import {
  EMAIL_SENDER,
  unreadyEmailSender,
  type EmailSender,
} from '../../email/email-sender.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrismaWhitelistResolver } from '../google/prisma-whitelist-resolver.js';
import { CodeRequestService } from './code-request.service.js';
import {
  CODE_REQUEST,
  EmailRequestController,
} from './email-request.controller.js';
import { loginCodeSecret } from './login-code-config.js';
import { loginCodeHasher } from './login-code-hash.js';
import {
  LOGIN_CODE_ISSUER,
  type LoginCodeIssuer,
} from './login-code-issuer.js';
import { PrismaLoginCodeIssuer } from './prisma-login-code-issuer.js';

@Module({
  imports: [PrismaModule],
  controllers: [EmailRequestController],
  providers: [
    // 39.1 replaces this binding with its SMTP adapter; until then every code fails to send.
    { provide: EMAIL_SENDER, useValue: unreadyEmailSender },
    {
      provide: LOGIN_CODE_ISSUER,
      useFactory: (prisma: PrismaService) => new PrismaLoginCodeIssuer(prisma),
      inject: [PrismaService],
    },
    {
      provide: CODE_REQUEST,
      useFactory: (
        issuer: LoginCodeIssuer,
        prisma: PrismaService,
        sender: EmailSender,
      ) =>
        new CodeRequestService(
          issuer,
          new PrismaWhitelistResolver(prisma),
          sender,
          loginCodeHasher(loginCodeSecret(process.env)),
          new Logger('EmailCodeRequest'),
        ),
      inject: [LOGIN_CODE_ISSUER, PrismaService, EMAIL_SENDER],
    },
  ],
})
export class EmailRequestModule {}
