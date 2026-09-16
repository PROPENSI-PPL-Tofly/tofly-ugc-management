import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CLOCK, systemClock } from './common/clock.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { CreatorsModule } from './creators/creators.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';

// Fail fast at boot if DB creds are missing, instead of a buried Prisma error later.
function validate(config: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!config[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return config;
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate }), PrismaModule, CreatorsModule],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: CLOCK, useValue: systemClock },
    // Applied to every route: the cost of a request here is a database read, so one
    // client should not be able to issue them without bound.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
