import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SESSION_STARTER } from '../google/ports.js';
import { PrismaWhitelistResolver } from '../google/prisma-whitelist-resolver.js';
import { ACCESS_CHECK } from './access-check.js';
import { sessionConfig } from './session-config.js';
import { SESSION_COOKIE, sessionCookie } from './session-cookie.js';
import { SessionController } from './session.controller.js';
import {
  AppSessionService,
  type SessionRepository,
} from './session.service.js';

export const SESSION_CONFIG = 'SESSION_CONFIG';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [SessionController],
  providers: [
    { provide: SESSION_CONFIG, useFactory: () => sessionConfig(process.env) },
    { provide: SESSION_COOKIE, useFactory: () => sessionCookie(process.env) },
    {
      provide: ACCESS_CHECK,
      useFactory: (prisma: PrismaService) =>
        new PrismaWhitelistResolver(prisma),
      inject: [PrismaService],
    },
    {
      provide: AppSessionService,
      useFactory: (
        prisma: PrismaService,
        config: ReturnType<typeof sessionConfig>,
        cookie: ReturnType<typeof sessionCookie>,
      ) =>
        new AppSessionService(
          prisma.app_sessions as unknown as SessionRepository,
          config,
          cookie,
        ),
      inject: [PrismaService, SESSION_CONFIG, SESSION_COOKIE],
    },
    {
      provide: SESSION_STARTER,
      useFactory: (sessions: AppSessionService) => ({
        start: async (
          response: Parameters<AppSessionService['start']>[0],
          principal: Parameters<AppSessionService['start']>[1],
        ) => {
          await sessions.start(response, principal);
        },
      }),
      inject: [AppSessionService],
    },
  ],
  exports: [AppSessionService, SESSION_STARTER, ACCESS_CHECK],
})
export class SessionModule {}
