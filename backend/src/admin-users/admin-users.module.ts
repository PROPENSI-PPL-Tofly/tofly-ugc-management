import { Module } from '@nestjs/common';
import { loginCodeSecret } from '../auth/email/login-code-config.js';
import { loginCodeHasher } from '../auth/email/login-code-hash.js';
import { AppSessionService } from '../auth/session/session.service.js';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminConfirmationService } from './admin-confirmation.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

/**
 * "Pengguna Admin" (PBI-23, SCRUM-246). AuditLogger comes from the global AuditModule and
 * AppSessionService from the global SessionModule. Confirmation codes are hashed with the login
 * code secret under their own subject, so one can never be used as the other.
 */
@Module({
  imports: [EmailModule],
  controllers: [AdminUsersController],
  providers: [
    AdminUsersService,
    {
      provide: AdminConfirmationService,
      useFactory: (
        prisma: PrismaService,
        sender: EmailSender,
        sessions: AppSessionService,
      ) =>
        new AdminConfirmationService(
          prisma,
          sender,
          loginCodeHasher(loginCodeSecret(process.env)),
          sessions,
        ),
      inject: [PrismaService, EMAIL_SENDER, AppSessionService],
    },
  ],
})
export class AdminUsersModule {}
